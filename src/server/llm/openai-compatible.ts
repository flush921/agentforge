import 'server-only'

import {
  isStepCount,
  NoObjectGeneratedError,
  Output,
  streamText,
  type LanguageModel,
  type LanguageModelUsage,
} from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { toolNameSchema, type Usage } from '@/lib/contracts/common'
import type { Env } from '@/server/env-schema'
import { buildToolSet, summarizeToolResult } from '@/server/tools/registry'
import type { LlmClient } from './types'

function mapUsage(usage: LanguageModelUsage | undefined): Usage {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  }
}

const RELAY_RETRY_DELAYS = [600, 1500] as const

/**
 * 一个子 Agent 最多走几步（每步一次模型调用，可含多次工具调用）。
 * 最后一步禁止调用工具，逼模型写出正文：计算类任务里模型常常一路调用计算器，
 * 实测 20 路里有 8 路在 6 步内全部用于工具调用（37~81 次），一个字正文都没写。
 */
export const MAX_AGENT_STEPS = 6

/** 最后一步追加的要求：工具已经不可用，直接用已有的计算结果写出完整产出。 */
export const FINAL_STEP_NOTICE =
  '工具调用次数已用完，不能再调用任何工具。请直接基于上面已经得到的计算结果，用文字写出本环节完整的最终产出；没算到的数据明确标注「未核算」，不要编造。'

/**
 * SDK 的 abort 片段有两种来源：调用方取消，或 SDK 自己的 timeout（totalMs / stepMs）到期。
 * 后者调用方的 signal 没有中止，要报成可重试的超时，而不是当成取消（那样会被映射为内部错误）。
 */
export function abortPartError(signal: AbortSignal): DOMException {
  return signal.aborted
    ? new DOMException('aborted', 'AbortError')
    : new DOMException('模型调用超时', 'TimeoutError')
}

function abortError(): DOMException {
  return new DOMException('aborted', 'AbortError')
}

function waitForRetry(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (signal === undefined || signal === null) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
  if (signal.aborted) return Promise.reject(abortError())

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function relayFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(input, init)
    if (response.status !== 403) return response

    const body = await response.clone().text()
    const temporary = body.includes('request illegal') || body.includes('account_restricted')
    if (!temporary || attempt >= RELAY_RETRY_DELAYS.length) return response

    await waitForRetry(RELAY_RETRY_DELAYS[attempt]!, init?.signal)
  }
}

export function createLiveClient(env: Env, model?: LanguageModel): LlmClient {
  const selectedModel =
    model ??
    createOpenAICompatible({
      name: 'llm',
      baseURL: env.LLM_BASE_URL ?? '',
      apiKey: env.LLM_API_KEY ?? '',
      includeUsage: true,
      fetch: relayFetch,
    }).chatModel(env.LLM_MODEL)

  return {
    mode: 'live',
    async generateJson(req) {
      const result = streamText({
        model: selectedModel,
        instructions: req.instructions,
        messages: req.messages,
        output: Output.json(),
        temperature: req.temperature,
        maxOutputTokens: req.maxOutputTokens,
        abortSignal: req.signal,
        timeout: { totalMs: 45_000 },
        maxRetries: 1,
        providerOptions: {
          llm: { thinking: { type: 'disabled' } },
        },
        onError: () => {},
      })
      let text = ''
      let usage: Usage = { inputTokens: 0, outputTokens: 0 }

      for await (const part of result.stream) {
        switch (part.type) {
          case 'text-delta':
            text += part.text
            break
          case 'finish':
            usage = mapUsage(part.totalUsage)
            break
          case 'error':
            if (!NoObjectGeneratedError.isInstance(part.error)) throw part.error
            break
          case 'abort':
            throw abortPartError(req.signal)
          default:
            break
        }
      }

      return { text, usage }
    },
    async *streamAgent(req) {
      const result = streamText({
        model: selectedModel,
        instructions: req.instructions,
        messages: req.messages,
        tools: buildToolSet(req.tools),
        stopWhen: isStepCount(MAX_AGENT_STEPS),
        prepareStep: ({ stepNumber, messages }) =>
          req.tools.length > 0 && stepNumber >= MAX_AGENT_STEPS - 1
            ? {
                // 只设 toolChoice: 'none' 时工具定义仍会发给模型，DeepSeek 偶尔会把工具调用
                // 的内部标记当正文写出来（实测 9 路里 3 路）。最后一步干脆不带工具，并明确要求写正文。
                activeTools: [],
                toolChoice: 'none' as const,
                messages: [...messages, { role: 'user' as const, content: FINAL_STEP_NOTICE }],
              }
            : undefined,
        abortSignal: req.signal,
        // 开思考写最终报告单步实测最长约 71 秒（16000 输出上限下），原来的 60 秒会把它掐断。
        timeout: { totalMs: 300_000, stepMs: 150_000 },
        maxRetries: 1,
        maxOutputTokens: req.maxOutputTokens,
        ...(req.thinking ? {} : { temperature: 0.7 }),
        providerOptions: {
          llm: {
            thinking: { type: req.thinking ? 'enabled' : 'disabled' },
            ...(req.thinking ? { reasoningEffort: 'low' as const } : {}),
          },
        },
        onError: () => {},
      })

      for await (const part of result.stream) {
        switch (part.type) {
          case 'start-step':
            yield { type: 'step-start' }
            break
          case 'reasoning-delta':
            yield { type: 'reasoning', delta: part.text }
            break
          case 'text-delta':
            yield { type: 'text', delta: part.text }
            break
          case 'tool-call': {
            const tool = toolNameSchema.safeParse(part.toolName)
            if (!tool.success) {
              break
            }
            yield {
              type: 'tool_call',
              callId: part.toolCallId,
              tool: tool.data,
              input: part.input,
            }
            break
          }
          case 'tool-result': {
            const tool = toolNameSchema.safeParse(part.toolName)
            if (!tool.success) {
              break
            }
            yield {
              type: 'tool_result',
              callId: part.toolCallId,
              ok: true,
              summary: summarizeToolResult(tool.data, part.output),
            }
            break
          }
          case 'tool-error': {
            const tool = toolNameSchema.safeParse(part.toolName)
            if (!tool.success) {
              break
            }
            yield {
              type: 'tool_result',
              callId: part.toolCallId,
              ok: false,
              summary: '工具执行失败',
            }
            break
          }
          case 'finish':
            yield { type: 'finish', usage: mapUsage(part.totalUsage) }
            break
          case 'error':
            throw part.error
          case 'abort':
            throw abortPartError(req.signal)
          default:
            break
        }
      }
    },
  }
}

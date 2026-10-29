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
            throw new DOMException('aborted', 'AbortError')
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
        prepareStep: ({ stepNumber }) =>
          req.tools.length > 0 && stepNumber >= MAX_AGENT_STEPS - 1
            ? { toolChoice: 'none' as const }
            : undefined,
        abortSignal: req.signal,
        timeout: { totalMs: 120_000, stepMs: 60_000 },
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
            throw new DOMException('aborted', 'AbortError')
          default:
            break
        }
      }
    },
  }
}

import 'server-only'

import {
  generateText,
  isStepCount,
  NoObjectGeneratedError,
  Output,
  streamText,
  type LanguageModel,
  type LanguageModelUsage,
} from 'ai'
import { createDeepSeek, type DeepSeekLanguageModelChatOptions } from '@ai-sdk/deepseek'
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

export function createDeepSeekClient(env: Env, model?: LanguageModel): LlmClient {
  const selectedModel =
    model ?? createDeepSeek({ apiKey: env.DEEPSEEK_API_KEY ?? '' }).chat(env.DEEPSEEK_MODEL)

  return {
    mode: 'live',
    async generateJson(req) {
      try {
        const result = await generateText({
          model: selectedModel,
          instructions: req.instructions,
          messages: req.messages,
          output: Output.json(),
          temperature: req.temperature,
          maxOutputTokens: req.maxOutputTokens,
          abortSignal: req.signal,
          timeout: 30_000,
          maxRetries: 1,
          providerOptions: {
            deepseek: {
              thinking: { type: 'disabled' },
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        })

        return { text: result.text, usage: mapUsage(result.usage) }
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error)) {
          return { text: error.text ?? '', usage: mapUsage(error.usage) }
        }
        throw error
      }
    },
    async *streamAgent(req) {
      const result = streamText({
        model: selectedModel,
        instructions: req.instructions,
        messages: req.messages,
        tools: buildToolSet(req.tools),
        stopWhen: isStepCount(6),
        abortSignal: req.signal,
        timeout: { totalMs: 120_000, stepMs: 60_000 },
        maxRetries: 1,
        maxOutputTokens: req.maxOutputTokens,
        ...(req.thinking ? {} : { temperature: 0.7 }),
        providerOptions: {
          deepseek: {
            thinking: { type: req.thinking ? 'enabled' : 'disabled' },
            ...(req.thinking ? { reasoningEffort: 'low' as const } : {}),
          } satisfies DeepSeekLanguageModelChatOptions,
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
          case 'tool-call':
            yield {
              type: 'tool_call',
              callId: part.toolCallId,
              tool: toolNameSchema.parse(part.toolName),
              input: part.input,
            }
            break
          case 'tool-result':
            yield {
              type: 'tool_result',
              callId: part.toolCallId,
              ok: true,
              summary: summarizeToolResult(toolNameSchema.parse(part.toolName), part.output),
            }
            break
          case 'tool-error':
            yield {
              type: 'tool_result',
              callId: part.toolCallId,
              ok: false,
              summary: '工具执行失败',
            }
            break
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

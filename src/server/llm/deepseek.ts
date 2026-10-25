import 'server-only'

import {
  generateText,
  NoObjectGeneratedError,
  Output,
  type LanguageModel,
  type LanguageModelUsage,
} from 'ai'
import { createDeepSeek, type DeepSeekLanguageModelChatOptions } from '@ai-sdk/deepseek'
import type { Usage } from '@/lib/contracts/common'
import type { Env } from '@/server/env-schema'
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
  }
}

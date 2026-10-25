import 'server-only'

import { assistantDraftSchema, type AssistantDraft } from '@/lib/contracts/assistant'
import { parseLlmOutput } from '@/lib/contracts/llm-output'
import type { LlmClient, LlmJsonRequest } from '@/server/llm/types'
import { buildGeneratePrompt } from '@/server/prompts/generate'
import { retryMessage } from '@/server/prompts/shared'
import type { ServiceResult } from './types'

export async function generateAssistant(
  llm: LlmClient,
  prompt: string,
  signal: AbortSignal,
): Promise<ServiceResult<AssistantDraft>> {
  const built = buildGeneratePrompt(prompt)
  let messages: LlmJsonRequest['messages'] = [{ role: 'user', content: built.user }]

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let text: string
    try {
      const result = await llm.generateJson({
        kind: 'generate',
        instructions: built.instructions,
        messages,
        temperature: 0.8,
        maxOutputTokens: 1500,
        signal,
      })
      text = result.text
    } catch (error) {
      return { ok: false, error }
    }

    const parsed = parseLlmOutput(assistantDraftSchema, text)
    if (parsed.ok) {
      return { ok: true, value: parsed.data }
    }

    if (attempt === 1) {
      return { ok: false, error: new Error('invalid_output') }
    }

    messages = [
      ...messages,
      { role: 'assistant', content: text },
      { role: 'user', content: retryMessage([parsed.error]) },
    ]
  }

  return { ok: false, error: new Error('invalid_output') }
}

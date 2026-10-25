import 'server-only'

import type { AssistantSpec } from '@/lib/contracts/assistant'
import { parseLlmOutput } from '@/lib/contracts/llm-output'
import { complexityAssessmentSchema, type ComplexityAssessment } from '@/lib/contracts/plan'
import { FALLBACK_ASSESSMENT, ruleAssess } from '@/lib/orchestrator/level'
import type { LlmClient } from '@/server/llm/types'
import { buildAssessPrompt } from '@/server/prompts/assess'
import type { ServiceResult } from './types'

const assessmentOutputSchema = complexityAssessmentSchema.omit({ source: true })

function isCancellation(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
  )
}

export async function assessTask(
  llm: LlmClient,
  assistant: AssistantSpec,
  task: string,
  signal: AbortSignal,
): Promise<ServiceResult<ComplexityAssessment>> {
  const ruleResult = ruleAssess(task)
  if (ruleResult !== null) {
    return { ok: true, value: ruleResult }
  }

  const built = buildAssessPrompt(assistant, task)
  try {
    const result = await llm.generateJson({
      kind: 'assess',
      instructions: built.instructions,
      messages: [{ role: 'user', content: built.user }],
      temperature: 0,
      maxOutputTokens: 300,
      signal,
    })
    const parsed = parseLlmOutput(assessmentOutputSchema, result.text)
    if (!parsed.ok) {
      return { ok: true, value: FALLBACK_ASSESSMENT }
    }

    return { ok: true, value: { ...parsed.data, source: 'llm' } }
  } catch (error) {
    if (isCancellation(error, signal)) {
      throw error
    }
    return { ok: true, value: FALLBACK_ASSESSMENT }
  }
}

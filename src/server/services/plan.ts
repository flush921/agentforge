import 'server-only'

import type { PlanResponse } from '@/lib/contracts/api'
import type { AssistantSpec } from '@/lib/contracts/assistant'
import { parseLlmOutput } from '@/lib/contracts/llm-output'
import { planSchema, type ComplexityAssessment, type Plan } from '@/lib/contracts/plan'
import { usableTools } from '@/lib/orchestrator/tools'
import { validatePlan } from '@/lib/orchestrator/validate-plan'
import type { LlmClient, LlmJsonRequest } from '@/server/llm/types'
import { buildPlanPrompt } from '@/server/prompts/plan'
import { retryMessage } from '@/server/prompts/shared'
import type { ServiceResult } from './types'

const planOutputSchema = planSchema.omit({ level: true })

export async function planTask(
  llm: LlmClient,
  assistant: AssistantSpec,
  task: string,
  level: 2 | 3 | 4,
  assessment: ComplexityAssessment,
  signal: AbortSignal,
): Promise<ServiceResult<PlanResponse>> {
  const allowedTools = usableTools(assistant.capabilities)
  const built = buildPlanPrompt(assistant, task, level, assessment, allowedTools)
  let messages: LlmJsonRequest['messages'] = [{ role: 'user', content: built.user }]
  const attempts: PlanResponse['attempts'] = []

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let text: string
    try {
      const result = await llm.generateJson({
        kind: 'plan',
        instructions: built.instructions,
        messages,
        temperature: 0.3,
        maxOutputTokens: 2500,
        signal,
      })
      text = result.text
    } catch (error) {
      return { ok: false, error }
    }

    const parsed = parseLlmOutput(planOutputSchema, text)
    let errors: string[]
    if (parsed.ok) {
      const plan: Plan = { level, ...parsed.data }
      errors = validatePlan(plan, { level, allowedTools })
      if (errors.length === 0) {
        return { ok: true, value: { plan, source: 'planner', attempts } }
      }
    } else {
      errors = [parsed.error]
    }

    attempts.push({ errors })
    if (attempt === 0) {
      messages = [
        ...messages,
        { role: 'assistant', content: text },
        { role: 'user', content: retryMessage(errors) },
      ]
    }
  }

  return { ok: true, value: { plan: null, source: 'fallback', attempts } }
}

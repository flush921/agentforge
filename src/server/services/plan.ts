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
import { isCancellation, withTransientRetry } from './retry'
import type { ServiceResult } from './types'

const ROUTE = '/api/orchestrate/plan'

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
      // 规划一旦失败，整次运行就会退回单 Agent，所以对中转站的临时抖动先重试一次。
      const result = await withTransientRetry(
        () =>
          llm.generateJson({
            kind: 'plan',
            instructions: built.instructions,
            messages,
            temperature: 0.3,
            maxOutputTokens: 2500,
            signal,
          }),
        ROUTE,
        signal,
        (code) => console.error(`[api] ${ROUTE} retry ${code}`),
      )
      text = result.text
    } catch (error) {
      if (isCancellation(error, signal)) {
        throw error
      }
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

  // 两次都没通过校验时整次运行会退回单 Agent；记下每次的首条错误，方便事后定位是哪条规则卡住了。
  const firstErrors = attempts.map((item) => (item.errors[0] ?? '').slice(0, 80)).join(' | ')
  console.error(`[api] ${ROUTE} fallback L${level} ${firstErrors}`)
  return { ok: true, value: { plan: null, source: 'fallback', attempts } }
}

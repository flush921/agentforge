import 'server-only'

import type { AssistantSpec } from '@/lib/contracts/assistant'
import { parseLlmOutput } from '@/lib/contracts/llm-output'
import {
  complexityAssessmentSchema,
  dimScoreSchema,
  type ComplexityAssessment,
} from '@/lib/contracts/plan'
import { FALLBACK_ASSESSMENT, ruleAssess } from '@/lib/orchestrator/level'
import { guardRule } from '@/lib/safety/guard'
import type { LlmClient } from '@/server/llm/types'
import { toApiError } from '@/server/llm/errors'
import { buildAssessPrompt } from '@/server/prompts/assess'
import { z } from 'zod'
import { isCancellation, waitForRetry } from './retry'
import type { ServiceResult } from './types'

const ROUTE = '/api/orchestrate/assess'

const assessmentOutputSchema = z.strictObject({
  dims: z.strictObject({
    subtasks: dimScoreSchema,
    tools: dimScoreSchema,
    parallel: dimScoreSchema,
    rigor: dimScoreSchema,
    length: dimScoreSchema,
  }),
  rationale: complexityAssessmentSchema.shape.rationale,
  guard: z.strictObject({
    blocked: z.boolean(),
    reason: z.string().max(60),
    topic: z.boolean(),
  }),
})

function fallbackResult(reason: string): ServiceResult<ComplexityAssessment> {
  console.error(`[api] ${ROUTE} fallback ${reason}`)
  return { ok: true, value: FALLBACK_ASSESSMENT }
}

function toAssessment(output: z.infer<typeof assessmentOutputSchema>): ComplexityAssessment {
  const { guard, ...rest } = output
  const assessment: ComplexityAssessment = { ...rest, source: 'llm' }
  if (guard.blocked) {
    const reason = guard.reason.trim()
    assessment.guard = {
      blocked: true,
      kind: guard.topic ? 'topic' : 'policy',
      reason: reason.length > 0 ? reason : '请求超出了助手的服务范围',
    }
  }
  return assessment
}

export async function assessTask(
  llm: LlmClient,
  assistant: AssistantSpec,
  task: string,
  signal: AbortSignal,
): Promise<ServiceResult<ComplexityAssessment>> {
  const guarded = guardRule(task)
  if (guarded !== null) {
    return { ok: true, value: guarded }
  }

  const ruleResult = ruleAssess(task)
  if (ruleResult !== null) {
    return { ok: true, value: ruleResult }
  }

  const built = buildAssessPrompt(assistant, task)
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await llm.generateJson({
        kind: 'assess',
        instructions: built.instructions,
        messages: [{ role: 'user', content: built.user }],
        temperature: 0,
        maxOutputTokens: 400,
        signal,
      })
      const parsed = parseLlmOutput(assessmentOutputSchema, result.text)
      if (!parsed.ok) {
        return fallbackResult('输出未通过校验')
      }

      return { ok: true, value: toAssessment(parsed.data) }
    } catch (error) {
      if (isCancellation(error, signal)) {
        throw error
      }
      const mapped = toApiError(error, signal, ROUTE)
      if (mapped.retryable && attempt === 0) {
        await waitForRetry(signal)
        continue
      }
      return fallbackResult(`调用失败（${mapped.error.code}）`)
    }
  }
}

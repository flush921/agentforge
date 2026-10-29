import { z } from 'zod'
import {
  agentRoleSchema,
  apiErrorSchema,
  requiredUnknownSchema,
  toolNameSchema,
  usageSchema,
} from './common'
import { assistantDraftSchema, assistantSpecSchema } from './assistant'
import { complexityAssessmentSchema, nodeIdSchema, planNodeSchema, planSchema } from './plan'
import { alignResultSchema, judgeResultSchema, ultraContextSchema } from './ultra'

const taskSchema = z.string().trim().min(1).max(4000)

export const healthResponseSchema = z.strictObject({
  ok: z.literal(true),
  mode: z.enum(['mock', 'live']),
  accessRequired: z.boolean(),
})

export const assistantGenerateRequestSchema = z.strictObject({
  prompt: z.string().trim().min(1).max(300),
})
export const assistantGenerateResponseSchema = z.strictObject({
  assistant: assistantDraftSchema,
})

export const assessRequestSchema = z.strictObject({
  assistant: assistantSpecSchema,
  task: taskSchema,
})
export const assessResponseSchema = z.strictObject({
  assessment: complexityAssessmentSchema,
})

export const planRequestSchema = z.strictObject({
  assistant: assistantSpecSchema,
  task: taskSchema,
  level: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  assessment: complexityAssessmentSchema,
  /** Ultra 模式：提示规划师多拆可并行的环节。 */
  ultra: z.boolean().optional(),
})
export const planResponseSchema = z.strictObject({
  plan: planSchema.nullable(),
  source: z.enum(['planner', 'fallback']),
  attempts: z.array(z.strictObject({ errors: z.array(z.string().trim().min(1)) })),
})

export const agentStepRequestSchema = z
  .strictObject({
    assistant: assistantSpecSchema,
    task: taskSchema,
    node: planNodeSchema,
    isFinal: z.boolean(),
    upstream: z
      .array(
        z.strictObject({
          nodeId: nodeIdSchema,
          title: z.string().trim().min(1).max(16),
          role: agentRoleSchema,
          output: z.string().trim().max(6000),
        }),
      )
      .max(6),
    revision: z
      .strictObject({
        round: z.number().int().min(1).max(2),
        feedback: z.string().trim().min(1).max(2000),
        previousOutput: z.string().trim().max(6000),
      })
      .optional(),
    ultra: ultraContextSchema.optional(),
  })
  .superRefine((request, ctx) => {
    if (request.node.role === 'reviewer' && request.upstream.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['upstream'],
        message: '审校节点至少需要 1 条上游产出',
      })
    }
    if (request.node.role === 'judge') {
      const lanes = request.ultra?.lanes ?? []
      const covered =
        request.upstream.length >= 2 &&
        request.upstream.every((item) => lanes.some((lane) => lane.nodeId === item.nodeId))
      if (!covered) {
        ctx.addIssue({
          code: 'custom',
          path: ['upstream'],
          message: '多路择优节点需要至少 2 条上游产出，且每条都要标明取向',
        })
      }
    }
    if (request.node.role === 'aligner' && request.upstream.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['upstream'],
        message: '方向校准节点需要正好 1 条上游产出',
      })
    }
    if (
      (request.node.role === 'judge' || request.node.role === 'aligner') &&
      request.ultra === undefined
    ) {
      ctx.addIssue({ code: 'custom', path: ['ultra'], message: 'Ultra 节点必须带 ultra 上下文' })
    }
  })

export const stepEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('reasoning'), delta: z.string() }),
  z.strictObject({ type: z.literal('text'), delta: z.string() }),
  z.strictObject({
    type: z.literal('tool_call'),
    callId: z.string().trim().min(1),
    tool: toolNameSchema,
    input: requiredUnknownSchema,
  }),
  z.strictObject({
    type: z.literal('tool_result'),
    callId: z.string().trim().min(1),
    ok: z.boolean(),
    summary: z.string().trim().max(300),
  }),
  z.strictObject({
    type: z.literal('review'),
    verdict: z.enum(['pass', 'revise']),
    issues: z.array(z.string().trim().min(1).max(200)).max(8),
  }),
  z.strictObject({ type: z.literal('judge'), result: judgeResultSchema }),
  z.strictObject({ type: z.literal('align'), result: alignResultSchema }),
  z.strictObject({ type: z.literal('done'), output: z.string(), usage: usageSchema }),
  z.strictObject({ type: z.literal('error'), error: apiErrorSchema, retryable: z.boolean() }),
])

/** 一次批量请求最多合并的步骤数，与 Ultra 的并发上限一致。 */
export const MAX_BATCH_STEPS = 24

/** 批量执行：多个步骤共用一条连接，事件按下标 i 区分属于哪个步骤。 */
export const agentBatchRequestSchema = z.strictObject({
  steps: z.array(agentStepRequestSchema).min(1).max(MAX_BATCH_STEPS),
})
export const agentBatchLineSchema = z.strictObject({
  i: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_BATCH_STEPS - 1),
  event: stepEventSchema,
})

export const apiErrorBodySchema = z.strictObject({ error: apiErrorSchema })

export type HealthResponse = z.infer<typeof healthResponseSchema>
export type AssistantGenerateRequest = z.infer<typeof assistantGenerateRequestSchema>
export type AssistantGenerateResponse = z.infer<typeof assistantGenerateResponseSchema>
export type AssessRequest = z.infer<typeof assessRequestSchema>
export type AssessResponse = z.infer<typeof assessResponseSchema>
export type PlanRequest = z.infer<typeof planRequestSchema>
export type PlanResponse = z.infer<typeof planResponseSchema>
export type AgentStepRequest = z.infer<typeof agentStepRequestSchema>
export type StepEvent = z.infer<typeof stepEventSchema>
export type AgentBatchRequest = z.infer<typeof agentBatchRequestSchema>
export type AgentBatchLine = z.infer<typeof agentBatchLineSchema>
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>

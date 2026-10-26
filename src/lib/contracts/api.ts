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
  })
  .superRefine((request, ctx) => {
    if (request.node.role === 'reviewer' && request.upstream.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['upstream'],
        message: '审校节点至少需要 1 条上游产出',
      })
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
  z.strictObject({ type: z.literal('done'), output: z.string(), usage: usageSchema }),
  z.strictObject({ type: z.literal('error'), error: apiErrorSchema, retryable: z.boolean() }),
])

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
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>

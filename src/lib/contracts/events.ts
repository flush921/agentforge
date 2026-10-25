import { z } from 'zod'
import { apiErrorSchema, toolNameSchema, usageSchema } from './common'
import { complexityAssessmentSchema, levelDecisionSchema, planNodeSchema, planSchema } from './plan'
import { levelSchema } from './common'

const requiredUnknownSchema = z.custom<unknown>((value) => value !== undefined, '字段必填')
const nodeReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z][a-z0-9_]{0,31}$/, '节点 id 格式不正确')
const eventEnvelope = {
  seq: z.number().int().nonnegative(),
  t: z.number().int().nonnegative(),
}

function event<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.strictObject({ ...eventEnvelope, ...shape })
}

export const runEventSchema = z.discriminatedUnion('type', [
  event({
    type: z.literal('run.started'),
    runId: z.string().trim().min(1),
    assistantId: z.string().trim().min(1),
    task: z.string().trim().min(1).max(4000),
    intensity: z.number().min(0).max(1),
  }),
  event({ type: z.literal('assess.started') }),
  event({
    type: z.literal('assess.completed'),
    assessment: complexityAssessmentSchema,
    decision: levelDecisionSchema,
  }),
  event({ type: z.literal('plan.started'), level: levelSchema }),
  event({
    type: z.literal('plan.attempt_failed'),
    attempt: z.number().int().min(1),
    errors: z.array(z.string().trim().min(1)),
  }),
  event({
    type: z.literal('plan.completed'),
    plan: planSchema,
    source: z.enum(['static', 'planner', 'fallback']),
    budget: z.number().int().nonnegative(),
  }),
  event({
    type: z.literal('node.added'),
    node: planNodeSchema,
    reason: z.enum(['revision', 'fallback']),
    revisionOf: nodeReferenceSchema.optional(),
  }),
  event({
    type: z.literal('node.started'),
    nodeId: nodeReferenceSchema,
    attempt: z.number().int().min(1),
  }),
  event({
    type: z.literal('node.reasoning'),
    nodeId: nodeReferenceSchema,
    delta: z.string(),
  }),
  event({
    type: z.literal('node.text'),
    nodeId: nodeReferenceSchema,
    delta: z.string(),
  }),
  event({
    type: z.literal('node.tool_call'),
    nodeId: nodeReferenceSchema,
    callId: z.string().trim().min(1),
    tool: toolNameSchema,
    input: requiredUnknownSchema,
  }),
  event({
    type: z.literal('node.tool_result'),
    nodeId: nodeReferenceSchema,
    callId: z.string().trim().min(1),
    ok: z.boolean(),
    summary: z.string(),
  }),
  event({
    type: z.literal('node.review'),
    nodeId: nodeReferenceSchema,
    verdict: z.enum(['pass', 'revise']),
    issues: z.array(z.string().trim().min(1)),
  }),
  event({
    type: z.literal('node.completed'),
    nodeId: nodeReferenceSchema,
    output: z.string(),
    usage: usageSchema,
  }),
  event({
    type: z.literal('node.failed'),
    nodeId: nodeReferenceSchema,
    error: apiErrorSchema,
  }),
  event({
    type: z.literal('node.skipped'),
    nodeId: nodeReferenceSchema,
    reason: z.string().trim().min(1),
  }),
  event({
    type: z.literal('budget.exceeded'),
    used: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative(),
  }),
  event({
    type: z.literal('run.completed'),
    output: z.string(),
    degraded: z.boolean(),
    usage: usageSchema,
    durationMs: z.number().int().nonnegative(),
  }),
  event({ type: z.literal('run.failed'), error: apiErrorSchema }),
  event({ type: z.literal('run.cancelled') }),
])

export type RunEvent = z.infer<typeof runEventSchema>
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type RunEventBody = DistributiveOmit<RunEvent, 'seq' | 't'>

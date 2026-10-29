import { z } from 'zod'
import {
  apiErrorSchema,
  levelSchema,
  requiredUnknownSchema,
  toolNameSchema,
  usageSchema,
} from './common'
import {
  complexityAssessmentSchema,
  levelDecisionSchema,
  nodeIdSchema,
  planNodeSchema,
  planSchema,
} from './plan'
import { alignResultSchema, judgeResultSchema } from './ultra'

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
    ultra: z.boolean().optional(),
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
    revisionOf: nodeIdSchema.optional(),
  }),
  event({
    type: z.literal('node.started'),
    nodeId: nodeIdSchema,
    attempt: z.number().int().min(1),
  }),
  event({
    type: z.literal('node.reasoning'),
    nodeId: nodeIdSchema,
    delta: z.string(),
  }),
  event({
    type: z.literal('node.text'),
    nodeId: nodeIdSchema,
    delta: z.string(),
  }),
  event({
    type: z.literal('node.tool_call'),
    nodeId: nodeIdSchema,
    callId: z.string().trim().min(1),
    tool: toolNameSchema,
    input: requiredUnknownSchema,
  }),
  event({
    type: z.literal('node.tool_result'),
    nodeId: nodeIdSchema,
    callId: z.string().trim().min(1),
    ok: z.boolean(),
    summary: z.string(),
  }),
  event({
    type: z.literal('node.review'),
    nodeId: nodeIdSchema,
    verdict: z.enum(['pass', 'revise']),
    issues: z.array(z.string().trim().min(1)),
  }),
  event({
    type: z.literal('node.judge'),
    nodeId: nodeIdSchema,
    result: judgeResultSchema,
  }),
  event({
    type: z.literal('node.align'),
    nodeId: nodeIdSchema,
    result: alignResultSchema,
  }),
  event({
    type: z.literal('node.completed'),
    nodeId: nodeIdSchema,
    output: z.string(),
    usage: usageSchema,
  }),
  event({
    type: z.literal('node.failed'),
    nodeId: nodeIdSchema,
    error: apiErrorSchema,
  }),
  event({
    type: z.literal('node.skipped'),
    nodeId: nodeIdSchema,
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
    warnings: z.array(z.string().trim().min(1).max(200)).max(5).optional(),
  }),
  event({ type: z.literal('run.failed'), error: apiErrorSchema }),
  event({ type: z.literal('run.cancelled') }),
])

export type RunEvent = z.infer<typeof runEventSchema>
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type RunEventBody = DistributiveOmit<RunEvent, 'seq' | 't'>

import { z } from 'zod'
import { levelSchema, usageSchema } from './common'
import { runEventSchema } from './events'

export const runStatusSchema = z.enum([
  'idle',
  'assessing',
  'planning',
  'running',
  'completed',
  'failed',
  'cancelled',
])

export const runRecordSchema = z.strictObject({
  runId: z.string().trim().min(1),
  assistantId: z.string().trim().min(1),
  task: z.string().trim().min(1).max(4000),
  createdAt: z.string().trim().datetime({ offset: true }),
  status: runStatusSchema,
  level: levelSchema.optional(),
  usage: usageSchema,
  durationMs: z.number().int().nonnegative().optional(),
  events: z.array(runEventSchema),
})

export type RunStatus = z.infer<typeof runStatusSchema>
export type RunRecord = z.infer<typeof runRecordSchema>

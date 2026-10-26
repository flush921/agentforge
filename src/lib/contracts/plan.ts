import { z } from 'zod'
import { agentRoleSchema, levelSchema, toolNameSchema } from './common'

export const nodeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z][a-z0-9_]{0,31}$/, '节点 id 格式不正确')

export const dimScoreSchema = z.union([z.literal(0), z.literal(1), z.literal(2)])

export const complexityAssessmentSchema = z.strictObject({
  dims: z.strictObject({
    subtasks: dimScoreSchema,
    tools: dimScoreSchema,
    parallel: dimScoreSchema,
    rigor: dimScoreSchema,
    length: dimScoreSchema,
  }),
  rationale: z.string().trim().min(1).max(80),
  source: z.enum(['rule', 'llm', 'fallback']),
  guard: z
    .strictObject({
      blocked: z.literal(true),
      reason: z.string().trim().min(1).max(60),
      kind: z.enum(['crisis', 'policy', 'topic']),
    })
    .optional(),
})

export const levelDecisionSchema = z.strictObject({
  rawScore: z.number().int().min(0).max(10),
  adjustment: z.number().int().min(-2).max(2),
  score: z.number().int().min(0).max(10),
  level: levelSchema,
  downgraded: z.boolean(),
})

export const planNodeSchema = z
  .strictObject({
    id: nodeIdSchema,
    role: agentRoleSchema,
    title: z.string().trim().min(1).max(16),
    instruction: z.string().trim().min(1).max(600),
    dependsOn: z
      .array(nodeIdSchema)
      .max(6)
      .refine((items) => new Set(items).size === items.length, 'dependsOn 不得重复'),
    tools: z
      .array(toolNameSchema)
      .max(4)
      .refine((items) => new Set(items).size === items.length, 'tools 不得重复'),
    reviewTarget: nodeIdSchema.optional(),
  })
  .superRefine((node, ctx) => {
    if (node.role === 'reviewer' && node.reviewTarget === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['reviewTarget'],
        message: '审校节点必须指定 reviewTarget',
      })
    }

    if (node.role !== 'reviewer' && node.reviewTarget !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['reviewTarget'],
        message: '非审校节点不得指定 reviewTarget',
      })
    }
  })

export const planSchema = z.strictObject({
  level: levelSchema,
  strategy: z.string().trim().min(1).max(120),
  nodes: z.array(planNodeSchema).min(1).max(8),
  outputNodeId: nodeIdSchema,
})

export type DimScore = z.infer<typeof dimScoreSchema>
export type ComplexityAssessment = z.infer<typeof complexityAssessmentSchema>
export type LevelDecision = z.infer<typeof levelDecisionSchema>
export type PlanNode = z.infer<typeof planNodeSchema>
export type Plan = z.infer<typeof planSchema>

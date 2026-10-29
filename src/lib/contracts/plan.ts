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
  upgraded: z.boolean().optional(),
  /** 用户开启了 Ultra，级别被固定为 L4。 */
  ultra: z.boolean().optional(),
})

/** Ultra 多路执行的五种取向，顺序即画布上的排列顺序；只有三路的环节用前三种。 */
export const laneSchema = z.enum(['rigor', 'depth', 'practical', 'breadth', 'novel'])
export const ultraStageSchema = z.enum(['lane', 'judge', 'align'])

/** Ultra 模式由编排器展开出的节点才带这个字段；规划师的计划里不得出现。 */
export const ultraMetaSchema = z
  .strictObject({
    /** 所属环节：计划里被展开的原节点 id。校准节点沿用这个 id，下游依赖因此不用改。 */
    group: nodeIdSchema,
    stage: ultraStageSchema,
    lane: laneSchema.optional(),
  })
  .superRefine((meta, ctx) => {
    if ((meta.stage === 'lane') !== (meta.lane !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['lane'],
        message: '只有多路执行节点带 lane，且必须带',
      })
    }
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
    ultra: ultraMetaSchema.optional(),
  })
  .superRefine((node, ctx) => {
    const expected = node.role === 'judge' ? 'judge' : node.role === 'aligner' ? 'align' : undefined
    if (expected !== undefined && node.ultra?.stage !== expected) {
      ctx.addIssue({
        code: 'custom',
        path: ['ultra'],
        message: `${node.role} 节点只能由 Ultra 展开生成`,
      })
    }
    if (expected === undefined && node.ultra !== undefined && node.ultra.stage !== 'lane') {
      ctx.addIssue({
        code: 'custom',
        path: ['ultra'],
        message: '评判与校准阶段必须使用对应角色',
      })
    }

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
export type Lane = z.infer<typeof laneSchema>
export type UltraStage = z.infer<typeof ultraStageSchema>
export type UltraMeta = z.infer<typeof ultraMetaSchema>
export type PlanNode = z.infer<typeof planNodeSchema>
export type Plan = z.infer<typeof planSchema>

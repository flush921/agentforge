import { z } from 'zod'
import type { AgentRole } from './common'
import { laneSchema, nodeIdSchema } from './plan'

/** Ultra 模式由编排器展开时生成的角色；规划师的计划里不允许出现。 */
export const ULTRA_ROLES: readonly AgentRole[] = ['judge', 'aligner']

/** Ultra 一个环节最少、最多的并行路数。 */
export const MIN_LANES = 3
export const MAX_LANES = 5

/** 多路择优的三个评分维度，分数数组按这个顺序排列。 */
export const JUDGE_DIMENSIONS = ['完整度', '可靠性', '可用性'] as const

const llmScores = z.array(z.number().int().min(1).max(10)).length(JUDGE_DIMENSIONS.length)

/**
 * 择优评审员的 LLM 输出。各路成果以「方案 1…N」匿名呈现，模型打分并给出完整排名；
 * 采用哪一路由代码决定：先比两次评审（正序、倒序）的平均总分，并列时比平均名次。
 */
export function judgeOutputSchema(count: number) {
  return z
    .strictObject({
      scores: z.array(llmScores).length(count),
      /** 方案编号从好到差排列，必须恰好包含 1…count 各一次。 */
      ranking: z.array(z.number().int().min(1).max(count)).length(count),
      reason: z.string().trim().min(1).max(200),
    })
    .superRefine((output, ctx) => {
      if (new Set(output.ranking).size !== count) {
        ctx.addIssue({
          code: 'custom',
          path: ['ranking'],
          message: `ranking 必须把 1~${count} 每个编号各列一次`,
        })
        return
      }
      // 排名要和分数一致：总分高的必须排在前面，排名只在同分的方案之间决定先后。
      // 实测模型会直接照抄呈现顺序作为排名，正倒序一平均就全部抵消。
      const total = (no: number) =>
        (output.scores[no - 1] ?? []).reduce((sum, score) => sum + score, 0)
      for (let index = 1; index < output.ranking.length; index += 1) {
        if (total(output.ranking[index]!) > total(output.ranking[index - 1]!)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ranking'],
            message: 'ranking 要和 scores 一致：总分高的方案必须排在前面，同分的方案再按优劣分先后',
          })
          return
        }
      }
    })
}

/** 两次评审取平均后的分数，可能带 .5。 */
const averagedScores = z.array(z.number().min(1).max(10)).length(JUDGE_DIMENSIONS.length)

export const judgeResultSchema = z.strictObject({
  winner: laneSchema,
  /** 只有一路完成或评审失败而直接采用时没有分数。 */
  scores: z
    .array(
      z.strictObject({
        lane: laneSchema,
        scores: averagedScores,
        /** 两次评审的平均名次，1 为最好；旧记录没有这个字段。 */
        rank: z.number().min(1).max(MAX_LANES).optional(),
      }),
    )
    .min(2)
    .max(MAX_LANES)
    .optional(),
  reason: z.string().trim().min(1).max(200),
  walkover: z.boolean().optional(),
})

/** 方向校准分数达到这个值视为与整体目标一致；低于它由代码决定当场纠偏。 */
export const ALIGN_PASS_SCORE = 7

const driftSchema = z.array(z.string().trim().min(1).max(200)).max(4)

/** 方向校准员的 LLM 输出：只打分并列出偏离点。 */
export const alignOutputSchema = z
  .strictObject({
    score: z.number().int().min(1).max(10),
    drift: driftSchema,
    summary: z.string().trim().min(1).max(200),
  })
  .superRefine((output, ctx) => {
    if (output.score < ALIGN_PASS_SCORE && output.drift.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['drift'],
        message: `score 低于 ${ALIGN_PASS_SCORE} 时至少需要 1 条偏离点`,
      })
    }
  })

export const alignResultSchema = z.strictObject({
  score: z.number().int().min(1).max(10),
  drift: driftSchema,
  summary: z.string().trim().min(1).max(200),
  aligned: z.boolean(),
})

/** Ultra 节点随步骤请求带上的上下文。 */
export const ultraContextSchema = z.strictObject({
  /** 规划师给出的整体策略，作为第二层审阅的「整体目标方向」。 */
  strategy: z.string().trim().min(1).max(120),
  /** 第一层审阅的结论，交给方向校准员参考。 */
  judgeNote: z.string().trim().min(1).max(600).optional(),
  /** 择优节点的各路上游与取向的对应关系，按取向顺序。 */
  lanes: z
    .array(z.strictObject({ nodeId: nodeIdSchema, lane: laneSchema }))
    .min(2)
    .max(MAX_LANES)
    .optional(),
})

export type JudgeOutput = z.infer<ReturnType<typeof judgeOutputSchema>>
export type JudgeResult = z.infer<typeof judgeResultSchema>
export type AlignOutput = z.infer<typeof alignOutputSchema>
export type AlignResult = z.infer<typeof alignResultSchema>
export type UltraContext = z.infer<typeof ultraContextSchema>

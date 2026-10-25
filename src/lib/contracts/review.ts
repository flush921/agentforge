import { z } from 'zod'

export const reviewOutputSchema = z
  .strictObject({
    verdict: z.enum(['pass', 'revise']),
    issues: z.array(z.string().trim().min(1).max(200)).max(5),
    summary: z.string().trim().min(1).max(200),
  })
  .superRefine((review, ctx) => {
    if (review.verdict === 'revise' && review.issues.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['issues'],
        message: 'revise 时至少需要 1 条修改意见',
      })
    }
  })

export type ReviewOutput = z.infer<typeof reviewOutputSchema>

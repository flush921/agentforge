import { describe, expect, it } from 'vitest'
import { reviewOutputSchema } from './review'

describe('reviewOutputSchema', () => {
  it('接受 pass 和带意见的 revise', () => {
    expect(
      reviewOutputSchema.safeParse({ verdict: 'pass', issues: [], summary: '通过' }).success,
    ).toBe(true)
    expect(
      reviewOutputSchema.safeParse({ verdict: 'revise', issues: ['补充依据'], summary: '需修改' })
        .success,
    ).toBe(true)
  })

  it('revise 不能没有修改意见', () => {
    expect(
      reviewOutputSchema.safeParse({ verdict: 'revise', issues: [], summary: '需修改' }).success,
    ).toBe(false)
  })

  it('意见最多 5 条', () => {
    expect(
      reviewOutputSchema.safeParse({
        verdict: 'revise',
        issues: Array.from({ length: 6 }, (_, index) => `意见 ${index + 1}`),
        summary: '需修改',
      }).success,
    ).toBe(false)
  })
})

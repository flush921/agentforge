import { describe, expect, it } from 'vitest'
import { nextNodeId, revisionStem } from './ids'

describe('revisionStem', () => {
  it.each([
    ['writer', 'writer'],
    ['writer_r1', 'writer'],
    ['writer_r1_2', 'writer'],
    ['writer_r12_34', 'writer'],
    ['writer_review', 'writer_review'],
  ])('%s → %s', (id, stem) => {
    expect(revisionStem(id)).toBe(stem)
  })
})

describe('nextNodeId', () => {
  it('按返工轮次生成 id，并去除旧轮次后缀', () => {
    expect(nextNodeId('writer', 1, new Set())).toBe('writer_r1')
    expect(nextNodeId('writer_r1', 2, new Set())).toBe('writer_r2')
  })

  it('冲突时依次添加数字后缀', () => {
    const existing = new Set(['writer_r1', 'writer_r1_2'])
    expect(nextNodeId('writer', 1, existing)).toBe('writer_r1_3')
  })

  it('长 id 截断到 32 字符以内', () => {
    const longId = `a${'b'.repeat(40)}`
    expect(nextNodeId(longId, 1, new Set())).toHaveLength(32)
    expect(nextNodeId(longId, 1, new Set([nextNodeId(longId, 1, new Set())]))).toHaveLength(32)
  })
})

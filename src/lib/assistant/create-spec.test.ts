import { describe, expect, it } from 'vitest'
import { testDraft } from '@/test/assistant'
import { assistantSpecSchema } from '../contracts/assistant'
import { draftToSpec } from './create-spec'

describe('draftToSpec', () => {
  it('补全 id、createdAt 并 trim sourcePrompt', () => {
    const spec = draftToSpec(testDraft, '  帮我做一个学习助手  ', {
      id: 'assistant-1',
      now: '2026-10-27T08:30:00.000Z',
    })

    expect(assistantSpecSchema.safeParse(spec).success).toBe(true)
    expect(spec).toMatchObject({
      id: 'assistant-1',
      schemaVersion: 1,
      createdAt: '2026-10-27T08:30:00.000Z',
      sourcePrompt: '帮我做一个学习助手',
      name: testDraft.name,
    })
  })

  it('不合法的补全字段会被 schema 拒绝', () => {
    expect(() => draftToSpec(testDraft, '学习助手', { id: '', now: 'invalid' })).toThrow()
  })
})

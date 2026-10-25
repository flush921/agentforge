import { describe, expect, it } from 'vitest'
import { assistantDraftSchema } from '@/lib/contracts/assistant'
import { MOCK_ASSISTANTS, selectAssistantDraft } from './assistants'

describe('mock assistants', () => {
  it.each(Object.entries(MOCK_ASSISTANTS))('%s 模板通过 AssistantDraft schema', (_, draft) => {
    expect(assistantDraftSchema.safeParse(draft).success).toBe(true)
  })

  it.each([
    ['考研择校', MOCK_ASSISTANTS.study],
    ['营养饮食', MOCK_ASSISTANTS.health],
    ['销售报表', MOCK_ASSISTANTS.data],
    ['教我 DEBUG', MOCK_ASSISTANTS.coding],
    ['随便聊聊', MOCK_ASSISTANTS.fallback],
  ] as const)('%s 匹配正确模板', (request, expected) => {
    expect(selectAssistantDraft(request)).toBe(expected)
  })

  it('健康模板包含免责声明和拒答主题', () => {
    expect(MOCK_ASSISTANTS.health.guardrails.disclaimer).toBeDefined()
    expect(MOCK_ASSISTANTS.health.guardrails.refuseTopics.length).toBeGreaterThan(0)
  })
})

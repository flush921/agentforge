import { describe, expect, it } from 'vitest'
import { assistantDraftSchema, assistantSpecSchema } from './assistant'

const validDraft = {
  name: '学习助手',
  avatar: '🎓',
  color: '#A1b2C3',
  tagline: '帮你制定清晰的学习计划',
  domain: '考研规划',
  directions: ['agent', 'education'],
  persona: '你是一位耐心、严谨的学习规划助手。',
  capabilities: ['web_search', 'image_input'],
  defaultIntensity: 0.5,
  guardrails: { refuseTopics: ['赌博'], disclaimer: '建议仅供参考。' },
  starters: ['解释一个概念', '制定一周学习计划', '分析复习情况并给出调整建议'],
}

const validSpec = {
  ...validDraft,
  id: '550e8400-e29b-41d4-a716-446655440000',
  schemaVersion: 1,
  createdAt: '2026-10-26T00:00:00.000Z',
  sourcePrompt: '创建一个考研学习助手',
}

type SchemaCase = {
  name: string
  schema: { safeParse: (value: unknown) => { success: boolean } }
  valid: unknown
  invalid: unknown[]
}

const cases: SchemaCase[] = [
  {
    name: 'assistantDraftSchema',
    schema: assistantDraftSchema,
    valid: validDraft,
    invalid: [
      { ...validDraft, name: 'x'.repeat(21) },
      { ...validDraft, extra: true },
      { ...validDraft, directions: ['other'] },
      { ...validDraft, capabilities: ['web_search', 'web_search'] },
      { ...validDraft, guardrails: { refuseTopics: [], disclaimer: '' } },
    ],
  },
  {
    name: 'assistantSpecSchema',
    schema: assistantSpecSchema,
    valid: validSpec,
    invalid: [
      { ...validSpec, sourcePrompt: 'x'.repeat(301) },
      { ...validSpec, extra: true },
      { ...validSpec, schemaVersion: 2 },
      { ...validSpec, createdAt: 'not-a-date' },
    ],
  },
]

describe('assistant schemas', () => {
  for (const testCase of cases) {
    describe(testCase.name, () => {
      it('接受合法样例', () => {
        expect(testCase.schema.safeParse(testCase.valid).success).toBe(true)
      })

      testCase.invalid.forEach((value, index) => {
        it(`拒绝非法样例 ${index + 1}`, () => {
          expect(testCase.schema.safeParse(value).success).toBe(false)
        })
      })
    })
  }

  it('trim 生效', () => {
    expect(assistantDraftSchema.parse({ ...validDraft, name: '  名字  ' }).name).toBe('名字')
  })

  it('全空白字符串不合法', () => {
    expect(assistantDraftSchema.safeParse({ ...validDraft, name: '   ' }).success).toBe(false)
  })
})

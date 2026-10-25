import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  agentRoleSchema,
  apiErrorSchema,
  capabilitySchema,
  directionSchema,
  errorCodeSchema,
  levelSchema,
  toolNameSchema,
  toolsForCapabilities,
  usageSchema,
  type Level,
} from './common'

type SchemaCase = {
  name: string
  schema: { safeParse: (value: unknown) => { success: boolean } }
  valid: unknown
  invalid: unknown[]
}

const cases: SchemaCase[] = [
  { name: 'directionSchema', schema: directionSchema, valid: 'agent', invalid: ['other', '', 1] },
  {
    name: 'capabilitySchema',
    schema: capabilitySchema,
    valid: 'web_search',
    invalid: ['other', '', 1],
  },
  {
    name: 'toolNameSchema',
    schema: toolNameSchema,
    valid: 'kb_search',
    invalid: ['knowledge_base', '', 1],
  },
  { name: 'levelSchema', schema: levelSchema, valid: 4, invalid: [5, -1, '4'] },
  {
    name: 'agentRoleSchema',
    schema: agentRoleSchema,
    valid: 'reviewer',
    invalid: ['admin', '', 1],
  },
  {
    name: 'usageSchema',
    schema: usageSchema,
    valid: { inputTokens: 0, outputTokens: 10 },
    invalid: [
      { inputTokens: -1, outputTokens: 10 },
      { inputTokens: 0.5, outputTokens: 10 },
      { inputTokens: 0, outputTokens: 10, extra: true },
    ],
  },
  {
    name: 'errorCodeSchema',
    schema: errorCodeSchema,
    valid: 'bad_request',
    invalid: ['bad', '', 1],
  },
  {
    name: 'apiErrorSchema',
    schema: apiErrorSchema,
    valid: { code: 'internal', message: '内部错误' },
    invalid: [
      { code: 'internal', message: ' ' },
      { code: 'internal', message: 'x'.repeat(501) },
      { code: 'other', message: '错误' },
      { code: 'internal', message: '错误', extra: true },
    ],
  },
]

describe('common schemas', () => {
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

  it('Level 推导为字面量联合', () => {
    expectTypeOf<Level>().toEqualTypeOf<0 | 1 | 2 | 3 | 4>()
  })

  it('apiErrorSchema 会 trim 信息', () => {
    const result = apiErrorSchema.parse({ code: 'internal', message: '  错误  ' })
    expect(result.message).toBe('错误')
  })
})

describe('toolsForCapabilities', () => {
  it('image_input 不产出工具', () => {
    expect(toolsForCapabilities(['image_input'])).toEqual([])
  })

  it('knowledge_base 映射为 kb_search', () => {
    expect(toolsForCapabilities(['knowledge_base'])).toEqual(['kb_search'])
  })

  it('按 ToolName 定义顺序输出并忽略 image_input', () => {
    expect(
      toolsForCapabilities([
        'image_input',
        'knowledge_base',
        'chart',
        'datetime',
        'calculator',
        'web_search',
      ]),
    ).toEqual(['web_search', 'calculator', 'datetime', 'chart', 'kb_search'])
  })

  it('输入重复时输出仍去重', () => {
    expect(toolsForCapabilities(['web_search', 'web_search'])).toEqual(['web_search'])
  })
})

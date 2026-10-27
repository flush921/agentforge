import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  complexityAssessmentSchema,
  dimScoreSchema,
  levelDecisionSchema,
  planNodeSchema,
  planSchema,
  type DimScore,
} from './plan'

const validAssessment = {
  dims: { subtasks: 1, tools: 1, parallel: 1, rigor: 1, length: 1 },
  rationale: '需要适度拆解任务',
  source: 'llm',
}
const validDecision = { rawScore: 5, adjustment: 0, score: 5, level: 2, downgraded: false }
const validNode = {
  id: 'answer',
  role: 'specialist',
  title: '直接回答',
  instruction: '直接回答用户的任务',
  dependsOn: [],
  tools: [],
}
const validPlan = { level: 0, strategy: '直接回答', nodes: [validNode], outputNodeId: 'answer' }

type SchemaCase = {
  name: string
  schema: { safeParse: (value: unknown) => { success: boolean } }
  valid: unknown
  invalid: unknown[]
}

const cases: SchemaCase[] = [
  { name: 'dimScoreSchema', schema: dimScoreSchema, valid: 2, invalid: [3, -1, '2'] },
  {
    name: 'complexityAssessmentSchema',
    schema: complexityAssessmentSchema,
    valid: validAssessment,
    invalid: [
      { ...validAssessment, rationale: 'x'.repeat(81) },
      { ...validAssessment, extra: true },
      { ...validAssessment, source: 'other' },
      { ...validAssessment, dims: { ...validAssessment.dims, tools: 3 } },
      {
        ...validAssessment,
        guard: { blocked: false, reason: 'x', kind: 'crisis' },
      },
      { ...validAssessment, guard: { blocked: true, reason: '', kind: 'crisis' } },
      { ...validAssessment, guard: { blocked: true, reason: 'x'.repeat(61), kind: 'crisis' } },
      { ...validAssessment, guard: { blocked: true, reason: 'x', kind: 'other' } },
      { ...validAssessment, guard: { blocked: true, reason: 'x', kind: 'crisis', extra: true } },
    ],
  },
  {
    name: 'levelDecisionSchema',
    schema: levelDecisionSchema,
    valid: validDecision,
    invalid: [
      { ...validDecision, rawScore: 11 },
      { ...validDecision, extra: true },
      { ...validDecision, level: 5 },
      { ...validDecision, adjustment: -3 },
    ],
  },
  {
    name: 'planNodeSchema',
    schema: planNodeSchema,
    valid: validNode,
    invalid: [
      { ...validNode, title: 'x'.repeat(17) },
      { ...validNode, extra: true },
      { ...validNode, role: 'admin' },
      { ...validNode, dependsOn: ['research', 'research'] },
      { ...validNode, tools: ['web_search', 'web_search'] },
    ],
  },
  {
    name: 'planSchema',
    schema: planSchema,
    valid: validPlan,
    invalid: [
      { ...validPlan, strategy: 'x'.repeat(121) },
      { ...validPlan, extra: true },
      { ...validPlan, level: 5 },
      { ...validPlan, nodes: [] },
    ],
  },
]

describe('plan schemas', () => {
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

  it('DimScore 推导为字面量联合', () => {
    expectTypeOf<DimScore>().toEqualTypeOf<0 | 1 | 2>()
  })

  it('reviewer 缺少 reviewTarget 时拒绝', () => {
    expect(planNodeSchema.safeParse({ ...validNode, role: 'reviewer' }).success).toBe(false)
  })

  it('非 reviewer 带 reviewTarget 时拒绝', () => {
    expect(planNodeSchema.safeParse({ ...validNode, reviewTarget: 'answer' }).success).toBe(false)
  })

  it('trim 生效', () => {
    expect(planNodeSchema.parse({ ...validNode, title: '  名字  ' }).title).toBe('名字')
  })

  it('全空白字符串不合法', () => {
    expect(planNodeSchema.safeParse({ ...validNode, title: '   ' }).success).toBe(false)
  })

  it('guard 为可选字段，blocked 必须为字面量 true', () => {
    expect(complexityAssessmentSchema.safeParse(validAssessment).success).toBe(true)
    expect(
      complexityAssessmentSchema.safeParse({
        ...validAssessment,
        guard: { blocked: true, reason: '检测到可能的心理危机信号', kind: 'crisis' },
      }).success,
    ).toBe(true)
  })

  it('upgraded 为可选布尔字段，旧数据缺失时按 false 读取', () => {
    const legacy = levelDecisionSchema.parse(validDecision)
    expect(legacy.upgraded ?? false).toBe(false)
    expect(levelDecisionSchema.parse({ ...validDecision, upgraded: true }).upgraded).toBe(true)
    expect(levelDecisionSchema.safeParse({ ...validDecision, upgraded: 'yes' }).success).toBe(false)
  })
})

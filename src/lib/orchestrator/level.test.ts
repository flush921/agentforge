import { describe, expect, it } from 'vitest'
import type { Capability, Level } from '../contracts/common'
import type { ComplexityAssessment } from '../contracts/plan'
import { buildStaticPlan, decideLevel, ruleAssess } from './level'
import { validatePlan } from './validate-plan'

type Dims = ComplexityAssessment['dims']

const zeroDims: Dims = { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 }
const fullDims: Dims = { subtasks: 2, tools: 2, parallel: 2, rigor: 2, length: 2 }
const levelCases: Array<{ score: number; dims: Dims; expected: Level }> = [
  { score: 0, dims: zeroDims, expected: 0 },
  { score: 1, dims: { ...zeroDims, subtasks: 1 }, expected: 0 },
  { score: 2, dims: { ...zeroDims, subtasks: 1, tools: 1 }, expected: 1 },
  { score: 3, dims: { ...zeroDims, subtasks: 2, tools: 1 }, expected: 1 },
  { score: 4, dims: { ...zeroDims, subtasks: 2, tools: 2 }, expected: 2 },
  { score: 5, dims: { ...zeroDims, subtasks: 2, tools: 2, parallel: 1 }, expected: 2 },
  { score: 6, dims: { ...zeroDims, subtasks: 2, tools: 2, parallel: 1, rigor: 1 }, expected: 3 },
  {
    score: 7,
    dims: { ...zeroDims, subtasks: 2, tools: 2, parallel: 1, rigor: 1, length: 1 },
    expected: 3,
  },
  { score: 8, dims: { subtasks: 2, tools: 2, parallel: 2, rigor: 1, length: 1 }, expected: 4 },
  { score: 9, dims: { subtasks: 2, tools: 2, parallel: 2, rigor: 2, length: 1 }, expected: 4 },
  { score: 10, dims: fullDims, expected: 4 },
]

describe('decideLevel', () => {
  it.each(levelCases)('score $score 映射到 L$expected', ({ score, dims, expected }) => {
    const result = decideLevel(dims, 0.5, true)
    expect(result).toEqual({
      rawScore: score,
      adjustment: 0,
      score,
      level: expected,
      downgraded: false,
    })
  })

  it.each([
    { intensity: 0, expected: -2 },
    { intensity: 0.5, expected: 0 },
    { intensity: 1, expected: 2 },
  ])('intensity=$intensity 的修正为 $expected', ({ intensity, expected }) => {
    expect(decideLevel(zeroDims, intensity, false).adjustment).toBe(expected)
  })

  it('intensity=0.4 的 adjustment 为 0 而不是 -0', () => {
    const result = decideLevel(zeroDims, 0.4, false)
    expect(result.adjustment).toBe(0)
    expect(Object.is(result.adjustment, -0)).toBe(false)
  })

  it.each([
    { intensity: -1, expected: -2 },
    { intensity: 2, expected: 2 },
  ])('越界 intensity=$intensity 先夹紧', ({ intensity, expected }) => {
    expect(decideLevel(zeroDims, intensity, false).adjustment).toBe(expected)
  })

  it('score 低于 0 时夹紧到 0', () => {
    expect(decideLevel(zeroDims, 0, false).score).toBe(0)
  })

  it('score 高于 10 时夹紧到 10', () => {
    expect(decideLevel(fullDims, 1, true).score).toBe(10)
  })

  it('L1 在 tools=0 时降级', () => {
    const result = decideLevel({ ...zeroDims, subtasks: 2 }, 0.5, true)
    expect(result).toMatchObject({ level: 0, score: 2, downgraded: true })
  })

  it('L1 在没有工具能力时降级', () => {
    const result = decideLevel({ ...zeroDims, subtasks: 1, tools: 1 }, 0.5, false)
    expect(result).toMatchObject({ level: 0, score: 2, downgraded: true })
  })

  it('tools≥1 且 hasTools 时 L1 不降级', () => {
    const result = decideLevel({ ...zeroDims, subtasks: 1, tools: 1 }, 0.5, true)
    expect(result).toMatchObject({ level: 1, score: 2, downgraded: false })
  })
})

describe('ruleAssess', () => {
  it.each(['你好', '谢谢！', 'Hi', '  晚安。  ', '你好~', '谢谢😊'])('命中整句寒暄：%s', (task) => {
    const result = ruleAssess(task)
    expect(result).not.toBeNull()
    expect(result).toMatchObject({
      dims: zeroDims,
      rationale: '简单寒暄，直接回答',
      source: 'rule',
    })
  })

  it.each(['你好，帮我写一份周报', '翻译 hello', 'ok 那开始吧'])('不命中真实任务：%s', (task) => {
    expect(ruleAssess(task)).toBeNull()
  })
})

describe('buildStaticPlan', () => {
  it('L0 计划通过 validatePlan', () => {
    const plan = buildStaticPlan(0, { capabilities: [] })
    expect(validatePlan(plan, { level: 0, allowedTools: [] })).toEqual([])
  })

  it('L1 计划通过 validatePlan', () => {
    const plan = buildStaticPlan(1, { capabilities: ['web_search'] })
    expect(validatePlan(plan, { level: 1, allowedTools: ['web_search'] })).toEqual([])
  })

  it('L1 在无工具时退回 L0', () => {
    const plan = buildStaticPlan(1, { capabilities: ['image_input'] })
    expect(plan.level).toBe(0)
    expect(validatePlan(plan, { level: 0, allowedTools: [] })).toEqual([])
  })

  it('工具超过 4 个时只取前 4 个', () => {
    const capabilities: Capability[] = [
      'web_search',
      'calculator',
      'datetime',
      'chart',
      'knowledge_base',
      'image_input',
    ]
    const plan = buildStaticPlan(1, { capabilities })
    expect(plan.nodes[0]?.tools).toEqual(['web_search', 'calculator', 'datetime', 'chart'])
  })
})

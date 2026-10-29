import { describe, expect, it } from 'vitest'
import { testAssistant, testAssessment } from '@/test/fixtures'
import { buildPlanPrompt } from './plan'
import { INJECTION_NOTICE } from './shared'

const task = '调研大学生使用 AI 学习工具的现状，写一份带数据和建议的分析报告'

describe('buildPlanPrompt', () => {
  it.each([
    [2, '严格串行流水线'],
    [3, '并行扇出再汇合'],
    [4, '审校节点作为质量闸门'],
  ] as const)('L%s 包含数据区、对应级别规则和工具清单', (level, rule) => {
    const result = buildPlanPrompt(testAssistant, task, level, testAssessment, [
      'datetime',
      'calculator',
    ])
    expect(result.instructions).toContain(`本次级别：L${level}`)
    expect(result.instructions).toContain(rule)
    if (level !== 4) expect(result.instructions).toContain('不要使用 reviewer 角色。')
    expect(result.instructions).toContain('- datetime：获取当前日期与时间')
    expect(result.instructions).toContain('- calculator：精确计算数学表达式')
    expect(result.instructions).toContain('只输出一个 JSON 对象')
    expect(result.user).toContain('<assistant>')
    expect(result.user).toContain('<assessment>')
    expect(result.user).toContain(`<task>\n${task}\n</task>`)
    expect(result.user.endsWith(INJECTION_NOTICE)).toBe(true)
    expect(result).toMatchSnapshot()
  })

  it.each([2, 3] as const)('L%s 不向模型列出 reviewer 角色，也不提审校节点', (level) => {
    const { instructions } = buildPlanPrompt(testAssistant, task, level, testAssessment, [])
    expect(instructions).not.toContain('- reviewer ')
    expect(instructions).not.toContain('含审校节点')
    expect(instructions).toContain('不要添加「核对、检查、审核、复核」')
    expect(instructions).toContain('所有节点都不得带 reviewTarget 字段。')
  })

  it('L4 列出 reviewer 角色并说明 reviewTarget', () => {
    const { instructions } = buildPlanPrompt(testAssistant, task, 4, testAssessment, [])
    expect(instructions).toContain('- reviewer 审校员')
    expect(instructions).toContain('（含审校节点）')
    expect(instructions).toContain('审校节点需额外带 "reviewTarget" 字段')
  })

  it('可用工具为空时明确要求空数组', () => {
    const result = buildPlanPrompt(testAssistant, task, 2, testAssessment, [])
    expect(result.instructions).toContain('无。所有节点的 tools 必须是空数组。')
  })
})

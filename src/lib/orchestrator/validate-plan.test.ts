import { describe, expect, it } from 'vitest'
import type { Level, ToolName } from '../contracts/common'
import type { Plan, PlanNode } from '../contracts/plan'
import { validPlans } from '../fixtures/plans'
import { validatePlan } from './validate-plan'

const allTools: ToolName[] = ['web_search', 'calculator', 'datetime', 'chart', 'kb_search']

function validate(plan: Plan, level: Level = plan.level, allowedTools: ToolName[] = allTools) {
  return validatePlan(plan, { level, allowedTools })
}

function nodeAt(plan: Plan, index: number): PlanNode {
  const node = plan.nodes[index]
  if (!node) {
    throw new Error(`测试计划缺少索引 ${index} 的节点`)
  }
  return node
}

function makeNode(id: string, dependsOn: string[] = []): PlanNode {
  return {
    id,
    role: 'specialist',
    title: '处理节点',
    instruction: '处理任务',
    dependsOn,
    tools: [],
  }
}

function makeReviewer(id: string, target: string): PlanNode {
  return {
    id,
    role: 'reviewer',
    title: '审校节点',
    instruction: '审校最终产出',
    dependsOn: [target],
    tools: [],
    reviewTarget: target,
  }
}

describe('validatePlan 合法计划', () => {
  it.each(validPlans)('L$level 计划合法', (plan) => {
    expect(validate(plan)).toEqual([])
  })
})

describe('validatePlan 十条规则', () => {
  it('R1：拒绝 plan.level 与 ctx.level 不一致', () => {
    const errors = validate(structuredClone(validPlans[2]), 3)
    expect(errors.some((error) => error.includes('级别') && error.includes('polish'))).toBe(true)
  })

  it('R2：拒绝重复节点 id', () => {
    const plan = structuredClone(validPlans[2])
    const first = nodeAt(plan, 0)
    nodeAt(plan, 1).id = first.id
    const errors = validate(plan)
    expect(errors.some((error) => error.includes('重复') && error.includes(first.id))).toBe(true)
  })

  it('R3：拒绝不存在的依赖', () => {
    const plan = structuredClone(validPlans[2])
    nodeAt(plan, 1).dependsOn = ['missing']
    const errors = validate(plan)
    expect(errors.some((error) => error.includes('write') && error.includes('missing'))).toBe(true)
  })

  it('R3：拒绝依赖自身', () => {
    const plan = structuredClone(validPlans[2])
    nodeAt(plan, 0).dependsOn = ['research']
    const errors = validate(plan)
    expect(errors.some((error) => error.includes('research') && error.includes('自身'))).toBe(true)
  })

  it('R4：拒绝环并报告环路径', () => {
    const plan = structuredClone(validPlans[2])
    nodeAt(plan, 0).dependsOn = ['write']
    nodeAt(plan, 1).dependsOn = ['research']
    expect(validate(plan).join('\n')).toContain('research → write → research')
  })

  it('R5：拒绝不存在的 outputNodeId', () => {
    const plan = structuredClone(validPlans[2])
    plan.outputNodeId = 'missing'
    expect(validate(plan).some((error) => error.includes('missing'))).toBe(true)
  })

  it('R6：拒绝不流向最终节点的工作节点', () => {
    const plan = structuredClone(validPlans[2])
    nodeAt(plan, 1).dependsOn = []
    const errors = validate(plan)
    expect(errors.some((error) => error.includes('research') && error.includes('无法流向'))).toBe(
      true,
    )
  })

  it('R7：拒绝超出节点数范围', () => {
    const plan = structuredClone(validPlans[0])
    plan.nodes.push({ ...nodeAt(plan, 0), id: 'other' })
    const errors = validate(plan)
    expect(errors.some((error) => error.includes('节点数') && error.includes('answer'))).toBe(true)
  })

  it('R8：拒绝未授权工具', () => {
    const errors = validate(structuredClone(validPlans[1]), 1, [])
    expect(errors.some((error) => error.includes('answer') && error.includes('web_search'))).toBe(
      true,
    )
  })

  it('R9：L0 节点不得带工具', () => {
    const plan = structuredClone(validPlans[0])
    nodeAt(plan, 0).tools = ['web_search']
    expect(
      validate(plan).some((error) => error.includes('answer') && error.includes('不得携带')),
    ).toBe(true)
  })

  it('R9：L1 节点至少带一个工具', () => {
    const plan = structuredClone(validPlans[1])
    nodeAt(plan, 0).tools = []
    expect(
      validate(plan).some((error) => error.includes('answer') && error.includes('至少需要')),
    ).toBe(true)
  })

  it('R9：L2 必须严格串行', () => {
    const plan = structuredClone(validPlans[2])
    nodeAt(plan, 1).dependsOn = []
    const errors = validate(plan)
    expect(errors.some((error) => error.includes('严格串行') && error.includes('write'))).toBe(true)
  })

  it('R9：L3 需要并行扇出', () => {
    const plan: Plan = {
      level: 3,
      strategy: '测试并行结构',
      nodes: [makeNode('a'), makeNode('b', ['a']), makeNode('c', ['a', 'b'])],
      outputNodeId: 'c',
    }
    const errors = validate(plan)
    expect(errors.some((error) => error.includes('并行深度') && error.includes('c'))).toBe(true)
  })

  it('R9：L3 需要汇合节点', () => {
    const plan: Plan = {
      level: 3,
      strategy: '测试汇合结构',
      nodes: [makeNode('a'), makeNode('b'), makeNode('c', ['b'])],
      outputNodeId: 'c',
    }
    const errors = validate(plan)
    expect(errors.some((error) => error.includes('汇合') && error.includes('c'))).toBe(true)
  })

  it('R10：非 L4 不允许审校节点', () => {
    const plan = structuredClone(validPlans[3])
    plan.nodes.push(makeReviewer('reviewer', 'writer'))
    const errors = validate(plan)
    expect(errors.some((error) => error.includes('reviewer') && error.includes('不得是'))).toBe(
      true,
    )
  })

  it('R10：L4 必须有且仅有一个审校节点', () => {
    const plan = structuredClone(validPlans[4])
    plan.nodes = plan.nodes.filter((node) => node.role !== 'reviewer')
    const errors = validate(plan)
    expect(errors.some((error) => error.includes('恰好') && error.includes('writer'))).toBe(true)
  })

  it('R10：L4 拒绝两个审校节点', () => {
    const plan = structuredClone(validPlans[4])
    plan.nodes.push(makeReviewer('reviewer_two', 'writer'))
    const errors = validate(plan)
    expect(errors.some((error) => error.includes('恰好') && error.includes('writer'))).toBe(true)
  })

  it('R10：reviewTarget 必须是最终节点', () => {
    const plan = structuredClone(validPlans[4])
    nodeAt(plan, 4).reviewTarget = 'analyst'
    const errors = validate(plan)
    expect(
      errors.some((error) => error.includes('reviewer') && error.includes('reviewTarget')),
    ).toBe(true)
  })

  it('R10：审校节点 dependsOn 必须正好是 reviewTarget', () => {
    const plan = structuredClone(validPlans[4])
    nodeAt(plan, 4).dependsOn = ['analyst']
    const errors = validate(plan)
    expect(errors.some((error) => error.includes('reviewer') && error.includes('dependsOn'))).toBe(
      true,
    )
  })

  it('R10：任何节点都不得依赖审校节点', () => {
    const plan = structuredClone(validPlans[4])
    plan.nodes.push(makeNode('after', ['reviewer']))
    const errors = validate(plan)
    expect(
      errors.some((error) => error.includes('after') && error.includes('不能依赖审校节点')),
    ).toBe(true)
  })

  it('R10：审校节点不能是最终节点', () => {
    const plan = structuredClone(validPlans[4])
    plan.outputNodeId = 'reviewer'
    const errors = validate(plan)
    expect(
      errors.some((error) => error.includes('reviewer') && error.includes('不能是最终节点')),
    ).toBe(true)
  })
})

describe('validatePlan 聚合错误', () => {
  it('一个计划同时违反三条规则时全部返回', () => {
    const plan = structuredClone(validPlans[2])
    const first = nodeAt(plan, 0)
    nodeAt(plan, 1).id = first.id
    nodeAt(plan, 2).dependsOn = ['missing']
    first.tools = ['web_search']

    const errors = validate(plan, 2, [])
    expect(errors.some((error) => error.includes('重复'))).toBe(true)
    expect(errors.some((error) => error.includes('missing'))).toBe(true)
    expect(errors.some((error) => error.includes('未授权工具'))).toBe(true)
    expect(errors.length).toBeGreaterThanOrEqual(3)
  })
})

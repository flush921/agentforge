import { describe, expect, it } from 'vitest'
import type { RunEvent } from '../contracts/events'
import type { Plan, PlanNode } from '../contracts/plan'
import type { RunStatus } from '../contracts/run-record'
import { sampleRunL0, sampleRunL4 } from '../fixtures/runs'
import { validPlans } from '../fixtures/plans'
import { LEVELS } from '../orchestrator/level'
import { applyEvent, initialRunState, reduceEvents } from './reducer'
import type { RunState } from './types'

function startEvent(): RunEvent {
  return {
    seq: 0,
    t: 0,
    type: 'run.started',
    runId: 'test-run',
    assistantId: 'assistant-test',
    task: '测试任务',
    intensity: 0.5,
  }
}

function plannedState(plan: Plan): RunState {
  return reduceEvents([
    startEvent(),
    {
      seq: 1,
      t: 10,
      type: 'plan.completed',
      plan,
      source: plan.level <= 1 ? 'static' : 'planner',
      budget: LEVELS[plan.level].budget,
    },
  ])
}

function nodeAt(plan: Plan, index: number): PlanNode {
  const node = plan.nodes[index]
  if (!node) {
    throw new Error(`测试计划缺少索引 ${index} 的节点`)
  }
  return node
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) {
      deepFreeze(nested)
    }
  }
  return value
}

describe('reduceEvents 演示运行', () => {
  it('sampleRunL4 最终状态、节点顺序和最终输出正确', () => {
    const state = reduceEvents(sampleRunL4)

    expect(state.status).toBe('completed')
    expect(state.nodeOrder).toEqual([
      'research_a',
      'research_b',
      'analyst',
      'writer',
      'reviewer',
      'writer_r1',
      'reviewer_r1',
    ])
    expect(state.outputNodeId).toBe('writer_r1')
    expect(state.nodes.writer_r1).toMatchObject({
      dynamic: true,
      revisionOf: 'writer',
      status: 'completed',
    })
    expect(state.output).toBe(state.nodes.writer_r1?.output)
  })

  it('重试节点 attempt 为 2，且只保留第二次文本', () => {
    const state = reduceEvents(sampleRunL4)
    const completed = sampleRunL4.find(
      (event) => event.type === 'node.completed' && event.nodeId === 'research_b',
    )

    expect(state.nodes.research_b?.attempt).toBe(2)
    expect(state.nodes.research_b?.text).toBe(
      completed?.type === 'node.completed' ? completed.output : undefined,
    )
    expect(state.nodes.research_b?.text).not.toContain('第一次尝试')
    expect(state.nodes.research_b?.error).toBeUndefined()
  })

  it('usage 等于 run.completed，budget.used 等于全部 token 之和', () => {
    const state = reduceEvents(sampleRunL4)
    const completed = sampleRunL4.find((event) => event.type === 'run.completed')
    const used = state.usage.inputTokens + state.usage.outputTokens

    expect(state.usage).toEqual(completed?.type === 'run.completed' ? completed.usage : undefined)
    expect(state.budget).toEqual({ limit: 100000, used, exceeded: false })
    expect(used).toBe(18820)
  })

  it('工具结果按 callId 写回', () => {
    const state = reduceEvents(sampleRunL4)
    expect(state.nodes.research_a?.toolCalls[0]).toMatchObject({
      callId: 'search_usage_1',
      ok: true,
      summary: '找到 3 份含样本说明的调查资料',
    })
  })

  it('sampleRunL0 最终状态正确', () => {
    const state = reduceEvents(sampleRunL0)

    expect(state).toMatchObject({
      status: 'completed',
      task: '你好',
      level: 0,
      planSource: 'static',
      outputNodeId: 'answer',
      output: '你好！很高兴见到你。',
      usage: { inputTokens: 12, outputTokens: 8 },
      durationMs: 340,
      lastT: 340,
    })
    expect(state.nodes.answer?.status).toBe('completed')
  })

  it('逐个 applyEvent 时 status 顺序正确', () => {
    let state = initialRunState()
    const statuses: RunStatus[] = []

    for (const event of sampleRunL0) {
      const next = applyEvent(state, event)
      if (next.status !== state.status) {
        statuses.push(next.status)
      }
      state = next
    }

    expect(statuses).toEqual(['assessing', 'planning', 'running', 'completed'])
  })
})

describe('applyEvent 取消与容错', () => {
  it('取消后 pending 和 running 节点都变为 skipped', () => {
    let state = plannedState(validPlans[2])
    state = applyEvent(state, {
      seq: 2,
      t: 20,
      type: 'node.started',
      nodeId: 'research',
      attempt: 1,
    })
    state = applyEvent(state, { seq: 3, t: 30, type: 'run.cancelled' })

    expect(state.status).toBe('cancelled')
    for (const id of ['research', 'write', 'polish']) {
      expect(state.nodes[id]).toMatchObject({
        status: 'skipped',
        skipReason: '已取消',
        endedAt: 30,
      })
    }
  })

  it('run.started 之前的事件不改变状态', () => {
    const state = initialRunState()
    const event: RunEvent = { seq: 0, t: 99, type: 'node.text', nodeId: 'missing', delta: '文本' }
    expect(applyEvent(state, event)).toBe(state)
  })

  it('未知 nodeId 的事件不改变状态', () => {
    const state = reduceEvents([startEvent()])
    const event: RunEvent = { seq: 1, t: 99, type: 'node.text', nodeId: 'missing', delta: '文本' }
    expect(applyEvent(state, event)).toBe(state)
  })

  it('未知 callId 的 tool_result 不改变状态', () => {
    const state = plannedState(validPlans[0])
    const event: RunEvent = {
      seq: 2,
      t: 20,
      type: 'node.tool_result',
      nodeId: 'answer',
      callId: 'missing',
      ok: true,
      summary: '结果',
    }
    expect(applyEvent(state, event)).toBe(state)
  })

  it('冻结入参后仍不修改原对象', () => {
    const state = deepFreeze(plannedState(validPlans[0]))
    const event = deepFreeze<RunEvent>({
      seq: 2,
      t: 20,
      type: 'node.started',
      nodeId: 'answer',
      attempt: 1,
    })
    const snapshot = structuredClone(state)

    const next = applyEvent(state, event)
    expect(next.nodes.answer?.status).toBe('running')
    expect(state).toEqual(snapshot)
  })

  it('重复的 node.added 被忽略', () => {
    const plan = validPlans[0]
    const state = plannedState(plan)
    const event: RunEvent = {
      seq: 2,
      t: 20,
      type: 'node.added',
      node: nodeAt(plan, 0),
      reason: 'fallback',
    }
    expect(applyEvent(state, event)).toBe(state)
  })

  it('run.started 会重置旧状态', () => {
    const oldState = reduceEvents(sampleRunL0)
    const next = applyEvent(oldState, {
      seq: 99,
      t: 500,
      type: 'run.started',
      runId: 'new-run',
      assistantId: 'new-assistant',
      task: '新任务',
      intensity: 0.7,
    })

    expect(next).toMatchObject({
      runId: 'new-run',
      assistantId: 'new-assistant',
      task: '新任务',
      intensity: 0.7,
      status: 'assessing',
      nodes: {},
      nodeOrder: [],
      planFailures: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      lastT: 500,
    })
    expect(next.plan).toBeUndefined()
    expect(next.output).toBeUndefined()
    expect(next.outputNodeId).toBeUndefined()
  })
})

describe('applyEvent 其余状态规则', () => {
  it('plan.attempt_failed 追加错误列表', () => {
    const state = plannedState(validPlans[0])
    const next = applyEvent(state, {
      seq: 2,
      t: 20,
      type: 'plan.attempt_failed',
      attempt: 1,
      errors: ['错误 A', '错误 B'],
    })
    expect(next.planFailures).toEqual([['错误 A', '错误 B']])
  })

  it('budget.exceeded 更新已有预算', () => {
    const state = plannedState(validPlans[0])
    const next = applyEvent(state, {
      seq: 2,
      t: 20,
      type: 'budget.exceeded',
      used: 4500,
      limit: 4000,
    })
    expect(next.budget).toEqual({ limit: 4000, used: 4500, exceeded: true })
  })

  it('budget.exceeded 在预算不存在时创建预算', () => {
    const state = reduceEvents([startEvent()])
    const next = applyEvent(state, {
      seq: 1,
      t: 20,
      type: 'budget.exceeded',
      used: 10,
      limit: 100,
    })
    expect(next.budget).toEqual({ limit: 100, used: 10, exceeded: true })
  })

  it('run.completed 写入 warnings，省略时为空数组', () => {
    const base = plannedState(validPlans[0])
    const completed = applyEvent(base, {
      seq: 2,
      t: 20,
      type: 'run.completed',
      output: '完成',
      degraded: true,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 20,
      warnings: ['预算不足', '审校未完成'],
    })
    expect(completed.warnings).toEqual(['预算不足', '审校未完成'])

    const withoutWarnings = applyEvent(base, {
      seq: 2,
      t: 20,
      type: 'run.completed',
      output: '完成',
      degraded: false,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 20,
    })
    expect(withoutWarnings.warnings).toEqual([])
    expect(initialRunState().warnings).toEqual([])
  })

  it('run.failed 写入错误', () => {
    const state = plannedState(validPlans[0])
    const next = applyEvent(state, {
      seq: 2,
      t: 20,
      type: 'run.failed',
      error: { code: 'internal', message: '运行失败' },
    })
    expect(next).toMatchObject({
      status: 'failed',
      error: { code: 'internal', message: '运行失败' },
      lastT: 20,
    })
  })

  it('node.skipped 写入原因和结束时间', () => {
    const state = plannedState(validPlans[0])
    const next = applyEvent(state, {
      seq: 2,
      t: 20,
      type: 'node.skipped',
      nodeId: 'answer',
      reason: '依赖失败',
    })
    expect(next.nodes.answer).toMatchObject({
      status: 'skipped',
      skipReason: '依赖失败',
      endedAt: 20,
    })
  })

  it('node.added fallback 更新最终节点', () => {
    const plan = validPlans[0]
    const state = plannedState(plan)
    const next = applyEvent(state, {
      seq: 2,
      t: 20,
      type: 'node.added',
      node: { ...nodeAt(plan, 0), id: 'fallback' },
      reason: 'fallback',
    })
    expect(next.outputNodeId).toBe('fallback')
    expect(next.nodeOrder).toEqual(['answer', 'fallback'])
    expect(next.nodes.fallback?.dynamic).toBe(true)
  })

  it('lastT 不会因较早事件而回退', () => {
    const state = plannedState(validPlans[0])
    const next = applyEvent(state, {
      seq: 2,
      t: 5,
      type: 'node.started',
      nodeId: 'answer',
      attempt: 1,
    })
    expect(next.lastT).toBe(10)
    expect(next.nodes.answer?.startedAt).toBe(5)
  })
})

describe('T02 review 回归', () => {
  function terminalState(status: 'completed' | 'failed' | 'cancelled'): RunState {
    if (status === 'completed') {
      return reduceEvents(sampleRunL0)
    }

    const event: RunEvent =
      status === 'failed'
        ? {
            seq: 2,
            t: 20,
            type: 'run.failed',
            error: { code: 'internal', message: '运行失败' },
          }
        : { seq: 2, t: 20, type: 'run.cancelled' }
    return applyEvent(plannedState(validPlans[2]), event)
  }

  function lateEvents(state: RunState): RunEvent[] {
    const nodeId = state.nodeOrder[0]
    if (!nodeId) {
      throw new Error('测试状态缺少节点')
    }

    return [
      { seq: 90, t: 900, type: 'node.started', nodeId, attempt: 1 },
      { seq: 91, t: 901, type: 'node.text', nodeId, delta: '迟到文本' },
      {
        seq: 92,
        t: 902,
        type: 'node.added',
        node: { ...nodeAt(validPlans[0], 0), id: 'late_node' },
        reason: 'fallback',
      },
    ]
  }

  it.each(['completed', 'failed', 'cancelled'] as const)(
    '%s 终态锁定所有迟到事件并返回原引用',
    (status) => {
      const state = terminalState(status)
      for (const event of lateEvents(state)) {
        expect(applyEvent(state, event)).toBe(state)
      }
    },
  )

  it('run.completed 将未完成节点以未执行收尾', () => {
    let state = plannedState(validPlans[2])
    state = applyEvent(state, {
      seq: 2,
      t: 20,
      type: 'node.started',
      nodeId: 'research',
      attempt: 1,
    })
    state = applyEvent(state, {
      seq: 3,
      t: 30,
      type: 'node.completed',
      nodeId: 'research',
      output: '调研结果',
      usage: { inputTokens: 10, outputTokens: 20 },
    })
    state = applyEvent(state, {
      seq: 4,
      t: 40,
      type: 'node.started',
      nodeId: 'write',
      attempt: 1,
    })
    state = applyEvent(state, {
      seq: 5,
      t: 50,
      type: 'run.completed',
      output: '提前收尾',
      degraded: true,
      usage: { inputTokens: 10, outputTokens: 20 },
      durationMs: 50,
    })

    expect(state.nodes.research?.status).toBe('completed')
    for (const id of ['write', 'polish']) {
      expect(state.nodes[id]).toMatchObject({
        status: 'skipped',
        skipReason: '未执行',
        endedAt: 50,
      })
    }
  })

  it('run.failed 将 pending 和 running 节点以运行失败收尾', () => {
    let state = plannedState(validPlans[2])
    state = applyEvent(state, {
      seq: 2,
      t: 20,
      type: 'node.started',
      nodeId: 'research',
      attempt: 1,
    })
    state = applyEvent(state, {
      seq: 3,
      t: 30,
      type: 'run.failed',
      error: { code: 'internal', message: '运行失败' },
    })

    for (const id of ['research', 'write', 'polish']) {
      expect(state.nodes[id]).toMatchObject({
        status: 'skipped',
        skipReason: '运行失败',
        endedAt: 30,
      })
    }
  })

  it('没有 revisionOf 时不会把未定义的最终节点覆盖掉', () => {
    const state = reduceEvents([startEvent()])
    const next = applyEvent(state, {
      seq: 1,
      t: 10,
      type: 'node.added',
      node: { ...nodeAt(validPlans[4], 4), id: 'early_reviewer' },
      reason: 'revision',
    })

    expect(next.outputNodeId).toBeUndefined()
    expect(next.nodes.early_reviewer?.dynamic).toBe(true)
  })
})

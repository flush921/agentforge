import { describe, expect, it } from 'vitest'
import type { RunEvent } from '../contracts/events'
import { validPlans } from '../fixtures/plans'
import { sampleRunL0, sampleRunL4 } from '../fixtures/runs'
import { LEVELS } from '../orchestrator/level'
import { reduceEvents } from '../run/reducer'
import type { RunState } from '../run/types'
import { deriveGraph } from './derive-graph'

function replayToEnd(events: Parameters<typeof reduceEvents>[0]): RunState {
  return reduceEvents(events)
}

function edgeSources(graph: ReturnType<typeof deriveGraph>, target: string): string[] {
  return graph.edges.filter((edge) => edge.target === target).map((edge) => edge.source)
}

describe('deriveGraph', () => {
  it('runId 为 null 时返回空图', () => {
    const graph = deriveGraph(replayToEnd([]))
    expect(graph.nodes).toEqual([])
    expect(graph.edges).toEqual([])
  })

  it('L0 结束：没有 planner，边依次为 task→router→answer→output', () => {
    const graph = deriveGraph(replayToEnd(sampleRunL0))

    expect(graph.nodes.map((node) => node.id)).toEqual([
      'sys:task',
      'sys:router',
      'n:answer',
      'sys:output',
    ])
    expect(graph.nodes.every((node) => node.status === 'completed')).toBe(true)
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
      'sys:task->sys:router',
      'sys:router->n:answer',
      'n:answer->sys:output',
    ])
    expect(graph.edges.every((edge) => edge.kind === 'flow')).toBe(true)
  })

  it('L4 结束：4 个系统节点加 7 个计划节点，主线走最后一道审校闸门', () => {
    const graph = deriveGraph(replayToEnd(sampleRunL4))

    const systemNodes = graph.nodes.filter((node) => node.id.startsWith('sys:'))
    const planNodes = graph.nodes.filter((node) => node.id.startsWith('n:'))
    expect(systemNodes).toHaveLength(4)
    expect(planNodes).toHaveLength(7)

    const feedback = graph.edges.find((edge) => edge.kind === 'feedback')
    expect(feedback).toMatchObject({ source: 'n:reviewer', target: 'n:writer_r1' })

    expect(edgeSources(graph, 'sys:output')).toEqual(['n:reviewer_r1'])
    expect(
      graph.edges.some((edge) => edge.target === 'sys:output' && edge.source === 'n:writer_r1'),
    ).toBe(false)

    for (const researcher of ['n:research_a', 'n:research_b']) {
      expect(edgeSources(graph, researcher)).toEqual(['sys:planner'])
    }

    const edgeIds = graph.edges.map((edge) => edge.id)
    expect(new Set(edgeIds).size).toBe(edgeIds.length)
  })

  it('L4 中途 t=3000：两个 researcher running，指向它们的边 active', () => {
    const state = replayToEnd(sampleRunL4.filter((event) => event.t <= 3000))
    const graph = deriveGraph(state)

    const researchA = graph.nodes.find((node) => node.id === 'n:research_a')
    const researchB = graph.nodes.find((node) => node.id === 'n:research_b')
    expect(researchA?.status).toBe('running')
    expect(researchB?.status).toBe('running')

    for (const researcher of ['n:research_a', 'n:research_b']) {
      const edge = graph.edges.find((item) => item.target === researcher)
      expect(edge?.active).toBe(true)
      expect(edge?.done).toBe(true)
      expect(edge?.source).toBe('sys:planner')
    }
  })

  it('降级节点：有依赖连 fallback 边，无依赖连 entry 的 fallback 边', () => {
    const plan = validPlans[2]
    const fallbackWithDep = {
      seq: 100,
      t: 500,
      type: 'node.added' as const,
      node: {
        id: 'alt_research',
        role: 'specialist' as const,
        title: '降级调研',
        instruction: '在没有工具的情况下凭内置知识回答',
        dependsOn: ['research'],
        tools: [],
      },
      reason: 'fallback' as const,
    }
    const fallbackNoDep = {
      ...fallbackWithDep,
      seq: 101,
      node: { ...fallbackWithDep.node, id: 'alt_direct', dependsOn: [] },
    }
    const state = reduceEvents([
      {
        seq: 0,
        t: 0,
        type: 'run.started',
        runId: 'run-fallback',
        assistantId: 'assistant-test',
        task: '测试任务',
        intensity: 0.5,
      },
      { seq: 1, t: 10, type: 'assess.started' },
      {
        seq: 2,
        t: 20,
        type: 'assess.completed',
        assessment: {
          dims: { subtasks: 1, tools: 1, parallel: 0, rigor: 1, length: 1 },
          rationale: '需要调研但工具不可用',
          source: 'llm',
        },
        decision: { rawScore: 5, adjustment: 0, score: 5, level: 2, downgraded: false },
      },
      {
        seq: 3,
        t: 30,
        type: 'plan.completed',
        plan,
        source: 'planner',
        budget: LEVELS[2].budget,
      },
      fallbackWithDep,
      fallbackNoDep,
    ])

    const graph = deriveGraph(state)
    const withDep = graph.edges.find((edge) => edge.target === 'n:alt_research')
    expect(withDep).toMatchObject({ source: 'n:research', kind: 'fallback' })
    const noDep = graph.edges.find((edge) => edge.target === 'n:alt_direct')
    expect(noDep).toMatchObject({ source: 'sys:planner', kind: 'fallback' })
  })

  it('运行失败且没有 decision：router 为 failed', () => {
    const state = reduceEvents([
      {
        seq: 0,
        t: 0,
        type: 'run.started',
        runId: 'run-failed',
        assistantId: 'assistant-test',
        task: '测试任务',
        intensity: 0.5,
      },
      {
        seq: 1,
        t: 100,
        type: 'run.failed',
        error: { code: 'upstream_error', message: '评估服务不可用' },
      },
    ])
    const graph = deriveGraph(state)

    const router = graph.nodes.find((node) => node.id === 'sys:router')
    expect(router?.status).toBe('failed')
    expect(graph.nodes.some((node) => node.id === 'sys:planner')).toBe(false)
    expect(graph.nodes.some((node) => node.id === 'sys:output')).toBe(false)
  })

  it('运行取消且没有 decision：router 为 skipped', () => {
    const state = reduceEvents([
      {
        seq: 0,
        t: 0,
        type: 'run.started',
        runId: 'run-cancelled',
        assistantId: 'assistant-test',
        task: '测试任务',
        intensity: 0.5,
      },
      { seq: 1, t: 10, type: 'assess.started' },
      { seq: 2, t: 50, type: 'run.cancelled' },
    ])
    const graph = deriveGraph(state)

    expect(graph.nodes.find((node) => node.id === 'sys:router')?.status).toBe('skipped')
  })

  it('评估后规划前：router completed、planner pending；planning 时 planner running', () => {
    const base: RunEvent[] = [
      {
        seq: 0,
        t: 0,
        type: 'run.started',
        runId: 'run-plan',
        assistantId: 'assistant-test',
        task: '测试任务',
        intensity: 0.5,
      },
      { seq: 1, t: 10, type: 'assess.started' },
      {
        seq: 2,
        t: 20,
        type: 'assess.completed',
        assessment: {
          dims: { subtasks: 2, tools: 1, parallel: 1, rigor: 1, length: 1 },
          rationale: '需要多环节协作',
          source: 'llm',
        },
        decision: { rawScore: 6, adjustment: 0, score: 6, level: 3, downgraded: false },
      },
    ]

    const beforePlanning = deriveGraph(reduceEvents(base))
    expect(beforePlanning.nodes.find((node) => node.id === 'sys:router')?.status).toBe('completed')
    expect(beforePlanning.nodes.find((node) => node.id === 'sys:planner')?.status).toBe('pending')

    const planning = deriveGraph(
      reduceEvents([...base, { seq: 3, t: 30, type: 'plan.started', level: 3 }]),
    )
    expect(planning.nodes.find((node) => node.id === 'sys:planner')?.status).toBe('running')
  })

  it('规划阶段失败：planner 为 failed，output 不存在', () => {
    const state = reduceEvents([
      {
        seq: 0,
        t: 0,
        type: 'run.started',
        runId: 'run-plan-failed',
        assistantId: 'assistant-test',
        task: '测试任务',
        intensity: 0.5,
      },
      { seq: 1, t: 10, type: 'assess.started' },
      {
        seq: 2,
        t: 20,
        type: 'assess.completed',
        assessment: {
          dims: { subtasks: 2, tools: 1, parallel: 1, rigor: 1, length: 1 },
          rationale: '需要多环节协作',
          source: 'llm',
        },
        decision: { rawScore: 6, adjustment: 0, score: 6, level: 3, downgraded: false },
      },
      { seq: 3, t: 30, type: 'plan.started', level: 3 },
      {
        seq: 4,
        t: 100,
        type: 'run.failed',
        error: { code: 'internal', message: '规划失败' },
      },
    ])
    const graph = deriveGraph(state)

    expect(graph.nodes.find((node) => node.id === 'sys:planner')?.status).toBe('failed')
    expect(graph.nodes.some((node) => node.id === 'sys:output')).toBe(false)
  })

  it('规划阶段取消：planner 为 skipped', () => {
    const state = reduceEvents([
      {
        seq: 0,
        t: 0,
        type: 'run.started',
        runId: 'run-plan-cancelled',
        assistantId: 'assistant-test',
        task: '测试任务',
        intensity: 0.5,
      },
      { seq: 1, t: 10, type: 'assess.started' },
      {
        seq: 2,
        t: 20,
        type: 'assess.completed',
        assessment: {
          dims: { subtasks: 2, tools: 1, parallel: 1, rigor: 1, length: 1 },
          rationale: '需要多环节协作',
          source: 'llm',
        },
        decision: { rawScore: 6, adjustment: 0, score: 6, level: 3, downgraded: false },
      },
      { seq: 3, t: 30, type: 'plan.started', level: 3 },
      { seq: 4, t: 80, type: 'run.cancelled' },
    ])
    const graph = deriveGraph(state)

    expect(graph.nodes.find((node) => node.id === 'sys:planner')?.status).toBe('skipped')
  })

  it('护栏拦截：不显示 planner，router 标记 guarded 并直接连接交付', () => {
    const events: RunEvent[] = [
      {
        seq: 0,
        t: 0,
        type: 'run.started',
        runId: 'run-guarded',
        assistantId: 'assistant-test',
        task: '护栏测试',
        intensity: 0.5,
      },
      { seq: 1, t: 5, type: 'assess.started' },
      {
        seq: 2,
        t: 10,
        type: 'assess.completed',
        assessment: {
          dims: { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 },
          rationale: '检测到可能的心理危机信号',
          source: 'rule',
          guard: {
            blocked: true,
            kind: 'crisis',
            reason: '检测到可能的心理危机信号',
          },
        },
        decision: { rawScore: 0, adjustment: 0, score: 0, level: 0, downgraded: false },
      },
      {
        seq: 3,
        t: 20,
        type: 'run.completed',
        output: '安全响应',
        degraded: false,
        usage: { inputTokens: 0, outputTokens: 0 },
        durationMs: 20,
        warnings: ['已按安全护栏拒绝执行'],
      },
    ]
    const graph = deriveGraph(reduceEvents(events))

    expect(graph.nodes.map((node) => node.id)).toEqual(['sys:task', 'sys:router', 'sys:output'])
    expect(graph.nodes.find((node) => node.id === 'sys:router')).toMatchObject({
      status: 'completed',
      guarded: true,
    })
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
      'sys:task->sys:router',
      'sys:router->sys:output',
    ])
  })
})

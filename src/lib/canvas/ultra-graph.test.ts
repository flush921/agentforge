import { describe, expect, it } from 'vitest'
import type { RunEvent, RunEventBody } from '../contracts/events'
import type { Plan } from '../contracts/plan'
import { validPlans } from '../fixtures/plans'
import { reduceEvents } from '../run/reducer'
import { deriveGraph, visibleNodeIds } from './derive-graph'
import { laneOutcome } from '../orchestrator/ultra'
import { groupBoxes, layoutGraph, NODE_SIZE } from './layout'

function events(bodies: RunEventBody[]): RunEvent[] {
  return bodies.map((body, seq) => ({ ...body, seq, t: seq }) as RunEvent)
}

function ultraEvents(extra: RunEventBody[] = [], ultra = true): RunEvent[] {
  const plan: Plan = structuredClone(validPlans[4])
  return events([
    {
      type: 'run.started',
      runId: 'r',
      assistantId: 'a',
      task: '任务',
      intensity: 0.5,
      ...(ultra ? { ultra: true } : {}),
    },
    {
      type: 'assess.completed',
      assessment: {
        dims: { subtasks: 1, tools: 0, parallel: 1, rigor: 1, length: 1 },
        rationale: '测试',
        source: 'llm',
      },
      decision: {
        rawScore: 4,
        adjustment: 0,
        score: 4,
        level: 4,
        downgraded: false,
        ...(ultra ? { ultra: true } : {}),
      },
    },
    { type: 'plan.started', level: 4 },
    { type: 'plan.completed', plan, source: 'planner', budget: 400000 },
    ...extra,
  ])
}

function started(...ids: string[]): RunEventBody[] {
  return ids.map((nodeId) => ({ type: 'node.started', nodeId, attempt: 1 }))
}

function completed(...ids: string[]): RunEventBody[] {
  return ids.map((nodeId) => ({
    type: 'node.completed',
    nodeId,
    output: `${nodeId} 完成`,
    usage: { inputTokens: 1, outputTokens: 1 },
  }))
}

describe('Ultra 画布', () => {
  it('多路、择优、校准各有独立类型，同一环节的节点带 group 与取向', () => {
    const graph = deriveGraph(reduceEvents(ultraEvents()))
    const byId = new Map(graph.nodes.map((node) => [node.id, node]))

    expect(byId.get('n:research_a_u1')).toMatchObject({
      kind: 'lane',
      group: 'research_a',
      lane: 'rigor',
    })
    expect(byId.get('n:research_a_u5')).toMatchObject({ kind: 'lane', lane: 'novel' })
    expect(byId.get('n:research_a_uj')).toMatchObject({ kind: 'judge', group: 'research_a' })
    expect(byId.get('n:research_a')).toMatchObject({ kind: 'aligner', group: 'research_a' })
    expect(byId.get('n:reviewer')).toMatchObject({ kind: 'reviewer' })
    expect(byId.get('n:reviewer')?.group).toBeUndefined()
    expect(graph.edges.map((edge) => edge.id)).toEqual(
      expect.arrayContaining([
        'flow:sys:planner->n:research_a_u1',
        'flow:n:research_a_u5->n:research_a_uj',
        'flow:n:research_a_uj->n:research_a',
        'flow:n:research_a->n:analyst_u1',
      ]),
    )
  })

  it('择优结束后，被采用那一路的边标记 picked，其余各路标记 unpicked', () => {
    const graph = deriveGraph(
      reduceEvents(
        ultraEvents([
          ...started(
            'research_a_u1',
            'research_a_u2',
            'research_a_u3',
            'research_a_u4',
            'research_a_u5',
          ),
          ...completed(
            'research_a_u1',
            'research_a_u2',
            'research_a_u3',
            'research_a_u4',
            'research_a_u5',
          ),
          ...started('research_a_uj'),
          {
            type: 'node.judge',
            nodeId: 'research_a_uj',
            result: {
              winner: 'depth',
              scores: [
                { lane: 'rigor', scores: [6, 6, 6] },
                { lane: 'depth', scores: [8, 8, 8] },
                { lane: 'practical', scores: [7, 7, 7] },
              ],
              reason: '更深入',
            },
          },
        ]),
      ),
    )
    const pick = (source: string) =>
      graph.edges.find((edge) => edge.id === `flow:n:${source}->n:research_a_uj`)?.pick

    expect(pick('research_a_u2')).toBe('picked')
    expect(pick('research_a_u1')).toBe('unpicked')
    expect(pick('research_a_u5')).toBe('unpicked')
    expect(
      graph.edges.find((edge) => edge.id === 'flow:n:research_a_uj->n:research_a')?.pick,
    ).toBeUndefined()
  })

  it('复合布局让每个环节框住自己的节点，环节框互不重叠', () => {
    const graph = deriveGraph(reduceEvents(ultraEvents()))
    for (const direction of ['LR', 'TB'] as const) {
      const positions = layoutGraph(graph.nodes, graph.edges, direction)
      const boxes = groupBoxes(graph.nodes, positions)

      expect(boxes.map((box) => box.id)).toEqual(['research_a', 'research_b', 'analyst', 'writer'])
      for (const box of boxes) {
        for (const node of graph.nodes.filter((candidate) => candidate.group === box.id)) {
          const position = positions.get(node.id)!
          const size = NODE_SIZE[node.kind]
          expect(position.x).toBeGreaterThanOrEqual(box.x)
          expect(position.y).toBeGreaterThanOrEqual(box.y)
          expect(position.x + size.width).toBeLessThanOrEqual(box.x + box.width)
          expect(position.y + size.height).toBeLessThanOrEqual(box.y + box.height)
        }
      }
      for (const [index, left] of boxes.entries()) {
        for (const right of boxes.slice(index + 1)) {
          const overlap =
            left.x < right.x + right.width &&
            right.x < left.x + left.width &&
            left.y < right.y + right.height &&
            right.y < left.y + left.height
          expect(overlap).toBe(false)
        }
      }
    }
  })

  it('两个方向下各路都按严谨、深度、落地、全面、创新的顺序排列', () => {
    const graph = deriveGraph(reduceEvents(ultraEvents()))
    for (const direction of ['LR', 'TB'] as const) {
      const positions = layoutGraph(graph.nodes, graph.edges, direction)
      const axis = direction === 'LR' ? 'y' : 'x'
      for (const [group, count] of [
        ['research_a', 5],
        ['analyst', 3],
        ['writer', 5],
      ] as const) {
        const order = Array.from(
          { length: count },
          (_, index) => positions.get(`n:${group}_u${index + 1}`)![axis],
        )
        expect(order).toEqual([...order].sort((a, b) => a - b))
      }
    }
  })
})

describe('逐步显现', () => {
  it('规划完成后只显示系统节点和起点环节；下游等任一上游开始工作才出现', () => {
    const initial = reduceEvents(ultraEvents())
    const visible = visibleNodeIds(initial, deriveGraph(initial))

    expect([...visible].filter((id) => id.startsWith('sys:'))).toEqual([
      'sys:task',
      'sys:router',
      'sys:planner',
    ])
    expect(visible.has('n:research_a_u1')).toBe(true)
    expect(visible.has('n:research_b_u5')).toBe(true)
    expect(visible.has('n:research_a_uj')).toBe(false)
    expect(visible.has('n:analyst_u1')).toBe(false)

    const running = reduceEvents(ultraEvents(started('research_a_u3')))
    const next = visibleNodeIds(running, deriveGraph(running))
    expect(next.has('n:research_a_uj')).toBe(true)
    expect(next.has('n:research_a')).toBe(false)
    expect(next.has('n:research_b_uj')).toBe(false)
  })

  it('交付节点在最后一环开始工作后出现；运行结束后全部可见', () => {
    const tail = reduceEvents(ultraEvents([...started('reviewer')]))
    expect(visibleNodeIds(tail, deriveGraph(tail)).has('sys:output')).toBe(true)

    const done = reduceEvents(
      ultraEvents([
        ...started('research_a_u1'),
        ...completed('research_a_u1'),
        { type: 'run.cancelled' },
      ]),
    )
    const graph = deriveGraph(done)
    const visible = visibleNodeIds(done, graph)
    expect(graph.nodes.every((node) => visible.has(node.id))).toBe(true)
  })

  it('普通模式同样逐步显现', () => {
    const state = reduceEvents(ultraEvents([], false))
    const visible = visibleNodeIds(state, deriveGraph(state))

    expect(state.nodeOrder).toHaveLength(5)
    expect(visible.has('n:research_a')).toBe(true)
    expect(visible.has('n:analyst')).toBe(false)
    expect(visible.has('n:reviewer')).toBe(false)
  })
})

describe('失败的一路', () => {
  it('择优结束后，失败的一路不标 unpicked，保留失败状态', () => {
    const state = reduceEvents(
      ultraEvents([
        ...started('research_a_u1', 'research_a_u2'),
        ...completed('research_a_u2'),
        {
          type: 'node.failed',
          nodeId: 'research_a_u1',
          error: { code: 'timeout', message: '模型响应超时' },
        },
        ...started('research_a_uj'),
        {
          type: 'node.judge',
          nodeId: 'research_a_uj',
          result: { winner: 'depth', walkover: true, reason: '直接采用' },
        },
      ]),
    )
    const graph = deriveGraph(state)
    const pick = (source: string) =>
      graph.edges.find((edge) => edge.id === `flow:n:${source}->n:research_a_uj`)?.pick

    expect(pick('research_a_u2')).toBe('picked')
    expect(pick('research_a_u1')).toBeUndefined()
    expect(graph.nodes.find((node) => node.id === 'n:research_a_u1')?.status).toBe('failed')
    expect(laneOutcome(state, state.nodes.research_a_u1!.node)).toBeUndefined()
    expect(laneOutcome(state, state.nodes.research_a_u2!.node)).toBe('picked')
  })
})

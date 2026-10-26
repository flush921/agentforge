import { describe, expect, it } from 'vitest'
import { sampleRunL0, sampleRunL4 } from '../fixtures/runs'
import { reduceEvents } from './reducer'
import { advanceReplay, initialCursor } from './replay'

describe('advanceReplay', () => {
  it('t 为 0 时不推进', () => {
    const cursor = advanceReplay(initialCursor(), sampleRunL0, 0)
    expect(cursor.index).toBe(1)
    expect(cursor.state.runId).toBe('run_l0')
    expect(cursor.state.status).toBe('assessing')
  })

  it('t 小于下一个事件时间时不推进', () => {
    let cursor = advanceReplay(initialCursor(), sampleRunL0, 0)
    cursor = advanceReplay(cursor, sampleRunL0, 50)
    expect(cursor.index).toBe(2)
    expect(cursor.state.decision).toBeUndefined()
  })

  it('按 t 推进，能跨越多个事件', () => {
    const cursor = advanceReplay(initialCursor(), sampleRunL0, 100)
    expect(cursor.index).toBe(5)
    expect(cursor.state.plan?.level).toBe(0)
    expect(cursor.state.nodeOrder).toEqual(['answer'])
  })

  it('分段推进与一次推进结果一致', () => {
    let cursor = advanceReplay(initialCursor(), sampleRunL4, 3000)
    expect(cursor.state.nodes.research_a?.status).toBe('running')
    expect(cursor.state.nodes.research_b?.status).toBe('running')

    cursor = advanceReplay(cursor, sampleRunL4, 20000)
    cursor = advanceReplay(cursor, sampleRunL4, 40_000)

    expect(cursor.index).toBe(sampleRunL4.length)
    expect(cursor.state).toEqual(reduceEvents(sampleRunL4))
  })

  it('回放到结尾的结果等于 reduceEvents（全部事件）', () => {
    const cursor = advanceReplay(initialCursor(), sampleRunL4, 40_000)
    expect(cursor.state.status).toBe('completed')
    expect(cursor.state).toEqual(reduceEvents(sampleRunL4))
  })

  it('t 变小时不会回退（由调用方从头重算）', () => {
    const cursor = advanceReplay(initialCursor(), sampleRunL0, 340)
    expect(cursor.index).toBe(sampleRunL0.length)

    const rewound = advanceReplay(cursor, sampleRunL0, 100)
    expect(rewound.index).toBe(sampleRunL0.length)
    expect(rewound.state.status).toBe('completed')
  })
})

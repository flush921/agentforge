import { beforeEach, describe, expect, it } from 'vitest'
import { validPlans } from '@/lib/fixtures/plans'
import { sampleRunL0 } from '@/lib/fixtures/runs'
import { initialRunState, reduceEvents } from '@/lib/run/reducer'
import { useRunStore } from './run-store'

beforeEach(() => {
  useRunStore.getState().reset()
})

describe('run store', () => {
  it('push 后的 state 与全部事件 reduce 的结果一致', () => {
    const store = useRunStore.getState()
    for (const event of sampleRunL0.slice(0, 6)) store.push(event)

    expect(useRunStore.getState().state).toEqual(reduceEvents(useRunStore.getState().events))
    expect(useRunStore.getState().events).toHaveLength(6)
  })

  it('reset 清空事件、计划、阶段和错误', () => {
    const store = useRunStore.getState()
    store.push(sampleRunL0[0]!)
    store.setPhase('awaiting_confirm')
    store.setPendingPlan(validPlans[3])
    useRunStore.setState({ error: '启动失败' })

    useRunStore.getState().reset()

    expect(useRunStore.getState().events).toEqual([])
    expect(useRunStore.getState().state).toEqual(initialRunState())
    expect(useRunStore.getState().phase).toBe('idle')
    expect(useRunStore.getState().pendingPlan).toBeUndefined()
    expect(useRunStore.getState().error).toBeUndefined()
  })

  it('phase 和 pendingPlan 可以切换及清空', () => {
    const store = useRunStore.getState()
    store.setPhase('awaiting_confirm')
    store.setPendingPlan(validPlans[4])
    expect(useRunStore.getState().phase).toBe('awaiting_confirm')
    expect(useRunStore.getState().pendingPlan).toEqual(validPlans[4])

    store.setPhase('done')
    store.setPendingPlan(undefined)
    expect(useRunStore.getState().phase).toBe('done')
    expect(useRunStore.getState().pendingPlan).toBeUndefined()
  })
})

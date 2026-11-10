import { describe, expect, it } from 'vitest'
import { reduceEvents } from '../run/reducer'
import { DEMO_RUN } from './demo-run'
import {
  getTourStep,
  isTourStepId,
  nextTourStep,
  stepAfterNavigation,
  stepAfterWelcome,
  TOUR_ASSISTANT_ID,
  TOUR_STEPS,
  tourPageHref,
  tourPageOf,
} from './steps'

describe('新手教程步骤', () => {
  it('步骤 id 不重复，从欢迎开始、以结束收尾', () => {
    const ids = TOUR_STEPS.map((step) => step.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe('welcome')
    expect(ids.at(-1)).toBe('finish')
  })

  it('每一步都有办法往下走：要么有「下一步」按钮，要么写明要做的操作', () => {
    for (const step of TOUR_STEPS) {
      if (step.id === 'finish') continue
      expect(step.nextLabel !== undefined || step.action !== undefined, step.id).toBe(true)
    }
  })

  it('nextTourStep 按顺序前进，最后一步之后返回 null', () => {
    expect(nextTourStep('welcome')).toBe('generate')
    expect(nextTourStep('complex')).toBe('demo')
    expect(nextTourStep('finish')).toBeNull()
  })

  it('isTourStepId 只认已定义的步骤', () => {
    expect(isTourStepId('node')).toBe(true)
    expect(isTourStepId('other')).toBe(false)
    expect(isTourStepId(undefined)).toBe(false)
    expect(getTourStep('node').title).toBe('每个节点都能点开')
  })

  it('tourPageOf 区分首页、工作台、演示回放和其他页面', () => {
    expect(tourPageOf('/')).toBe('home')
    expect(tourPageOf('/demo')).toBe('demo')
    expect(tourPageOf('/a/preset-kaoyan')).toBe('workspace')
    expect(tourPageOf('/a/preset-kaoyan/runs/abc')).toBe('other')
    expect(tourPageOf('/dev/canvas')).toBe('other')
  })

  it('tourPageHref 给出回到教程的地址', () => {
    expect(tourPageHref('home')).toBe('/')
    expect(tourPageHref('demo')).toBe('/demo')
    expect(tourPageHref('workspace')).toBe(`/a/${TOUR_ASSISTANT_ID}`)
  })

  it('在首页的步骤里打开了 Agent，就从提问那一步继续', () => {
    expect(stepAfterNavigation('generate', 'workspace')).toBe('simple')
    expect(stepAfterNavigation('pick-agent', 'workspace')).toBe('simple')
    // 欢迎卡片在任何页面都能显示，不自动跳过。
    expect(stepAfterNavigation('welcome', 'workspace')).toBeNull()
    expect(stepAfterNavigation('pick-agent', 'home')).toBeNull()
  })

  it('只有「复杂任务」这一步进入演示回放页才会前进', () => {
    expect(stepAfterNavigation('complex', 'demo')).toBe('demo')
    expect(stepAfterNavigation('controls', 'demo')).toBeNull()
    expect(stepAfterNavigation('simple', 'home')).toBeNull()
  })

  it('看完欢迎卡片：在工作台里直接从提问开始，其余从生成 Agent 开始', () => {
    expect(stepAfterWelcome('workspace')).toBe('simple')
    expect(stepAfterWelcome('home')).toBe('generate')
    expect(stepAfterWelcome('other')).toBe('generate')
  })
})

describe('演示回放的数据', () => {
  it('和教程里的说明一致：两路调研并行，审校打回后长出修订和复核节点，最后完成', () => {
    const events = DEMO_RUN.events
    const state = reduceEvents(events)
    const started = (nodeId: string) =>
      events.find((event) => event.type === 'node.started' && event.nodeId === nodeId)?.t ?? -1
    const completed = (nodeId: string) =>
      events.find((event) => event.type === 'node.completed' && event.nodeId === nodeId)?.t ?? -1

    expect(state.status).toBe('completed')
    expect(started('research_b')).toBeGreaterThan(started('research_a'))
    expect(started('research_b')).toBeLessThan(completed('research_a'))
    expect(events.some((event) => event.type === 'node.review' && event.verdict === 'revise')).toBe(
      true,
    )
    expect(events.filter((event) => event.type === 'node.added')).toHaveLength(2)
  })

  it('还是示例数据时不能标成真实录制', () => {
    expect(DEMO_RUN.recorded).toBe(false)
  })
})

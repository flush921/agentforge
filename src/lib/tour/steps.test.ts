import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reduceEvents } from '../run/reducer'
import { DEMO_SPEED, demoNote, FALLBACK_DEMO_RUN, parseDemoRun } from './demo-run'
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
  const recorded = parseDemoRun(
    JSON.parse(readFileSync(resolve(process.cwd(), 'public/demo-run.json'), 'utf8')),
  )

  it('public/demo-run.json 是一次正常完成的真实运行，能通过校验', () => {
    expect(recorded).toBeDefined()
    expect(recorded?.recorded).toBe(true)
    expect(recorded?.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(recorded?.durationMs).toBeGreaterThan(60_000)
    expect(reduceEvents(recorded?.events ?? []).status).toBe('completed')
  })

  it('录像和教程里的说明一致：三路调研并行，审校打回一次后长出修订和复核节点，复核通过', () => {
    const events = recorded?.events ?? []
    const research = events.filter(
      (event) => event.type === 'node.started' && event.nodeId.startsWith('research_'),
    )
    const firstDone = events.find(
      (event) => event.type === 'node.completed' && event.nodeId.startsWith('research_'),
    )
    const verdicts = events.flatMap((event) =>
      event.type === 'node.review' ? [event.verdict] : [],
    )

    expect(research).toHaveLength(3)
    // 三个调研节点都在第一个调研完成之前启动，才算同时运行。
    for (const event of research) expect(event.t).toBeLessThan(firstDone?.t ?? -1)
    expect(verdicts).toEqual(['revise', 'pass'])
    expect(events.filter((event) => event.type === 'node.added')).toHaveLength(2)
    // 审校截断修复后，这次运行不应再带「审校仍有未解决的意见」之类的警告。
    const warnings = events.flatMap((event) =>
      event.type === 'run.completed' ? (event.warnings ?? []) : [],
    )
    expect(warnings).toEqual([])
  })

  it('8 倍速回放的时长和教程写的「大约 25 秒」对得上', () => {
    const seconds = (recorded?.durationMs ?? 0) / 1000 / DEMO_SPEED
    expect(seconds).toBeGreaterThan(20)
    expect(seconds).toBeLessThan(30)
    expect(getTourStep('complex').body).toContain('大约 25 秒')
  })

  it('说明条写明是预先录制的真实运行，并带上当时的用时', () => {
    const note = recorded === undefined ? '' : demoNote(recorded)
    expect(note).toContain('预先录制的一次真实运行')
    expect(note).toContain('3 分 17 秒')
    expect(note).toContain('不是实时生成的结果')
  })

  it('格式不对、没跑完或没有事件的记录不采用', () => {
    const raw: unknown = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/demo-run.json'), 'utf8'),
    )
    expect(parseDemoRun(undefined)).toBeUndefined()
    expect(parseDemoRun({ task: '只有任务' })).toBeUndefined()
    expect(parseDemoRun({ ...(raw as object), status: 'failed' })).toBeUndefined()
    expect(parseDemoRun({ ...(raw as object), events: [] })).toBeUndefined()
  })

  it('退回示例数据时不能标成真实录制', () => {
    expect(FALLBACK_DEMO_RUN.recorded).toBe(false)
    expect(reduceEvents(FALLBACK_DEMO_RUN.events).status).toBe('completed')
    expect(demoNote(FALLBACK_DEMO_RUN)).toContain('示例数据')
    expect(demoNote(FALLBACK_DEMO_RUN)).not.toContain('真实运行（')
  })
})

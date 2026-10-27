import { describe, expect, it } from 'vitest'
import { levelSchema } from '@/lib/contracts/common'
import { PRESET_ASSISTANTS } from '@/lib/fixtures/preset-assistants'
import { buildAssessPrompt } from '@/server/prompts/assess'
import { GUARD_CASES, ROUTE_CASES } from './route-dataset'
import { ROUTE_HOLDOUT } from './route-holdout'
import { ROUTE_HOLDOUT2 } from './route-holdout2'

const COST_SAMPLE_TASKS = [
  '上月销售额 86 万，本月 103 万，环比增长率是多少？',
  '成本 45 元、售价 78 元，毛利率是多少？',
  '今年四个季度销售额分别是 120、135、128、160 万，季度平均值是多少？',
  '中位数和平均数有什么区别？',
]

describe('路由 holdout-2', () => {
  it('包含 30 条用例，id 与既有评测集和护栏不重复', () => {
    expect(ROUTE_HOLDOUT2).toHaveLength(30)
    const ids = [...ROUTE_HOLDOUT2, ...ROUTE_HOLDOUT, ...ROUTE_CASES, ...GUARD_CASES].map(
      (item) => item.id,
    )
    expect(new Set(ids).size).toBe(98)
    for (const presetId of ['preset-kaoyan', 'preset-diet', 'preset-data']) {
      expect(ROUTE_HOLDOUT2.filter((item) => item.presetId === presetId)).toHaveLength(10)
    }
  })

  it('每条用例的 preset 存在、标签合法且任务长度有效', () => {
    for (const item of ROUTE_HOLDOUT2) {
      expect(
        PRESET_ASSISTANTS.some((preset) => preset.id === item.presetId),
        item.id,
      ).toBe(true)
      expect(item.expected.length, item.id).toBeGreaterThan(0)
      expect(item.task.length, item.id).toBeGreaterThanOrEqual(1)
      expect(item.task.length, item.id).toBeLessThanOrEqual(4000)
      for (const level of item.expected) {
        expect(levelSchema.safeParse(level).success, `${item.id}: ${level}`).toBe(true)
      }
    }
  })

  it('与开发集和 holdout-1 没有重复任务', () => {
    const usedTasks = new Set([...ROUTE_CASES, ...ROUTE_HOLDOUT].map((item) => item.task))
    for (const item of ROUTE_HOLDOUT2) {
      expect(usedTasks.has(item.task), item.id).toBe(false)
    }
  })

  it('与校准示例和 T15 成本采样任务没有重复', () => {
    const instructions = buildAssessPrompt(PRESET_ASSISTANTS[0]!, '').instructions
    const calibrationTasks = [...instructions.matchAll(/^- 「([^」]+)」→/gm)].map(
      (match) => match[1],
    )
    expect(calibrationTasks.length).toBeGreaterThan(0)
    for (const item of ROUTE_HOLDOUT2) {
      expect(calibrationTasks).not.toContain(item.task)
      expect(COST_SAMPLE_TASKS).not.toContain(item.task)
    }
  })
})

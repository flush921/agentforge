import { describe, expect, it } from 'vitest'
import { levelSchema } from '@/lib/contracts/common'
import { PRESET_ASSISTANTS } from '@/lib/fixtures/preset-assistants'
import { buildAssessPrompt } from '@/server/prompts/assess'
import { GUARD_CASES, ROUTE_CASES } from './route-dataset'
import { ROUTE_HOLDOUT } from './route-holdout'

describe('路由留出集', () => {
  it('包含 30 条用例，id 与开发集和护栏不重复', () => {
    expect(ROUTE_HOLDOUT).toHaveLength(30)
    expect(
      new Set([...ROUTE_HOLDOUT, ...ROUTE_CASES, ...GUARD_CASES].map((item) => item.id)).size,
    ).toBe(68)
    for (const presetId of ['preset-kaoyan', 'preset-diet', 'preset-data']) {
      expect(ROUTE_HOLDOUT.filter((item) => item.presetId === presetId)).toHaveLength(10)
    }
  })

  it('每条用例的 preset 存在、标签合法且任务长度有效', () => {
    for (const item of ROUTE_HOLDOUT) {
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

  it('与开发集没有重复任务', () => {
    const developmentTasks = new Set(ROUTE_CASES.map((item) => item.task))
    for (const item of ROUTE_HOLDOUT) {
      expect(developmentTasks.has(item.task), item.id).toBe(false)
    }
  })

  it('与当前评分标准的校准示例没有重复任务', () => {
    const instructions = buildAssessPrompt(PRESET_ASSISTANTS[0]!, '').instructions
    const calibrationTasks = [...instructions.matchAll(/^- 「([^」]+)」→/gm)].map(
      (match) => match[1],
    )
    expect(calibrationTasks.length).toBeGreaterThan(0)
    for (const item of ROUTE_HOLDOUT) {
      expect(calibrationTasks).not.toContain(item.task)
    }
  })
})

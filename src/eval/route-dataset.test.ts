import { describe, expect, it } from 'vitest'
import { levelSchema } from '@/lib/contracts/common'
import { PRESET_ASSISTANTS } from '@/lib/fixtures/preset-assistants'
import { GUARD_CASES, ROUTE_CASES } from './route-dataset'

describe('路由评测数据集', () => {
  it('包含 30 条路由、8 条护栏且 id 不重复', () => {
    expect(ROUTE_CASES).toHaveLength(30)
    expect(GUARD_CASES).toHaveLength(8)
    expect(GUARD_CASES.filter((item) => item.shouldBlock)).toHaveLength(4)
    expect(GUARD_CASES.filter((item) => !item.shouldBlock)).toHaveLength(4)
    expect(new Set([...ROUTE_CASES, ...GUARD_CASES].map((item) => item.id)).size).toBe(38)
    for (const presetId of ['preset-kaoyan', 'preset-diet', 'preset-data']) {
      expect(ROUTE_CASES.filter((item) => item.presetId === presetId)).toHaveLength(10)
    }
  })

  it('每条用例的 presetId 都存在于 PRESET_ASSISTANTS', () => {
    for (const item of [...ROUTE_CASES, ...GUARD_CASES]) {
      expect(
        PRESET_ASSISTANTS.some((preset) => preset.id === item.presetId),
        item.id,
      ).toBe(true)
    }
  })

  it('每条路由的 expected 非空且只包含 0..4', () => {
    for (const item of ROUTE_CASES) {
      expect(item.expected.length, item.id).toBeGreaterThan(0)
      for (const level of item.expected) {
        expect(levelSchema.safeParse(level).success, `${item.id}: ${level}`).toBe(true)
      }
    }
  })

  it('每条任务文本长度都在 1..4000', () => {
    for (const item of [...ROUTE_CASES, ...GUARD_CASES]) {
      expect(item.task.length, item.id).toBeGreaterThanOrEqual(1)
      expect(item.task.length, item.id).toBeLessThanOrEqual(4000)
    }
  })
})

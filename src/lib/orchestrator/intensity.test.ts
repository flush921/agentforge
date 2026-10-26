import { describe, expect, it } from 'vitest'
import { decideLevel, intensityAdjustment } from './level'

describe('intensityAdjustment', () => {
  it('与 decideLevel 使用同一调整值', () => {
    const dims = { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 } as const
    for (const value of [0, 0.05, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]) {
      expect(intensityAdjustment(value)).toBe(decideLevel(dims, value, true).adjustment)
    }
  })

  it('两端与默认强度的调整值正确', () => {
    expect(intensityAdjustment(0)).toBe(-2)
    expect(intensityAdjustment(0.5)).toBe(0)
    expect(intensityAdjustment(1)).toBe(2)
  })
})

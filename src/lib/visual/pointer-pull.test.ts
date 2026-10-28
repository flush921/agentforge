import { describe, expect, it } from 'vitest'
import {
  DRAG_RADIUS,
  DRAG_STRENGTH,
  distanceToSegment,
  MAX_OFFSET,
  dragWeight,
  remainingAfter,
  SPRING_OMEGA,
} from './pointer-pull'

describe('distanceToSegment', () => {
  it('落在线段上为 0，垂足在线段内取垂直距离，垂足在线段外取端点距离', () => {
    expect(distanceToSegment(5, 0, 0, 0, 10, 0)).toBe(0)
    expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBe(3)
    expect(distanceToSegment(-4, 3, 0, 0, 10, 0)).toBe(5)
    expect(distanceToSegment(14, 3, 0, 0, 10, 0)).toBe(5)
  })

  it('零长度线段退化为点距离', () => {
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBe(5)
  })
})

describe('dragWeight', () => {
  it('轨迹正中最大，向外单调减小，半径外为 0', () => {
    expect(dragWeight(0)).toBeCloseTo(DRAG_STRENGTH, 6)
    let previous = Infinity
    for (let d = 0; d < DRAG_RADIUS; d += 1) {
      const weight = dragWeight(d)
      expect(weight).toBeLessThanOrEqual(previous)
      previous = weight
    }
    expect(dragWeight(DRAG_RADIUS)).toBe(0)
    expect(dragWeight(DRAG_RADIUS * 3)).toBe(0)
  })

  it('范围很窄：半径不超过 60 像素，一半强度出现在 20 像素以内', () => {
    expect(DRAG_RADIUS).toBeLessThanOrEqual(60)
    expect(dragWeight(20)).toBeLessThan(DRAG_STRENGTH * 0.6)
  })

  it('强度与上限的关系：上限留有余量，只有最贴近轨迹的星才会逼近上限，尖刺才是尖的', () => {
    // 实测（页面里扫一遍 210 像素）最贴近轨迹的星峰值约 38 像素，参考视频约 40 像素；
    // 上限必须明显高于这个峰值，否则很多星会被削到同一个位移，画出一条平台而不是尖刺。
    expect(MAX_OFFSET).toBeGreaterThan(45)
    expect(MAX_OFFSET).toBeLessThan(60)
    expect(DRAG_STRENGTH).toBeGreaterThan(0.4)
    expect(DRAG_STRENGTH).toBeLessThan(0.9)
  })
})

describe('remainingAfter', () => {
  it('临界阻尼回落：单调、不过冲，与参考视频实测的 0.83/0.58/0.33/0.13/0.05 吻合', () => {
    expect(remainingAfter(0)).toBeCloseTo(1, 6)
    let previous = 1
    for (let ms = 50; ms <= 8000; ms += 50) {
      const value = remainingAfter(ms)
      expect(value).toBeLessThan(previous)
      expect(value).toBeGreaterThan(0)
      previous = value
    }
    const measured: Array<[number, number]> = [
      [700, 0.83],
      [1400, 0.58],
      [2100, 0.33],
      [2800, 0.13],
      [3500, 0.05],
    ]
    for (const [ms, expected] of measured) {
      expect(Math.abs(remainingAfter(ms) - expected)).toBeLessThan(0.1)
    }
  })

  it('弹簧参数合理：ω 在 0.9~1.3 之间，3.5 秒后基本平复', () => {
    expect(SPRING_OMEGA).toBeGreaterThan(0.9)
    expect(SPRING_OMEGA).toBeLessThan(1.3)
    expect(remainingAfter(3500)).toBeLessThan(0.15)
  })
})

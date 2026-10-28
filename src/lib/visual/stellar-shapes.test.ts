import { describe, expect, it } from 'vitest'
import {
  ARM_MAIN,
  ARM_TAIL,
  armRadius,
  CONSTELLATION_EDGES,
  CONSTELLATION_NODES,
  constellationShape,
  galaxyShape,
  glyphShape,
  matchPoints,
  mulberry32,
  scatterShape,
} from './stellar-shapes'

const N = 1200

function maxAbs(points: Float32Array, axis: 0 | 1): number {
  let max = 0
  for (let i = axis; i < points.length; i += 2) max = Math.max(max, Math.abs(points[i]!))
  return max
}

describe('mulberry32', () => {
  it('同一种子得到同一序列，取值落在 [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i += 1) {
      const value = a()
      expect(value).toBe(b())
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('星辰形状', () => {
  it('每种形状都返回 n 个有限坐标', () => {
    const mask = { width: 4, height: 4, alpha: new Uint8Array(16).fill(255) }
    for (const shape of [
      scatterShape(N, mulberry32(1)),
      galaxyShape(N, mulberry32(2)),
      constellationShape(N, mulberry32(3)),
      glyphShape(N, mulberry32(4), mask),
    ]) {
      expect(shape.points).toHaveLength(N * 2)
      expect(shape.points.every(Number.isFinite)).toBe(true)
    }
  })

  it('散点铺满两侧，星系集中在中心且会自转', () => {
    const scatter = scatterShape(N, mulberry32(1))
    expect(maxAbs(scatter.points, 0)).toBeGreaterThan(2)
    const galaxy = galaxyShape(N, mulberry32(2))
    expect(galaxy.spin).toBe(true)
    // 主体半径约为 1；只有长臂甩出的一段在外面，最远约 1.25。
    let inside = 0
    let far = 0
    for (let i = 0; i < N; i += 1) {
      const r = Math.hypot(galaxy.points[i * 2]!, galaxy.points[i * 2 + 1]!)
      if (r < 1.12) inside += 1
      far = Math.max(far, r)
    }
    expect(inside / N).toBeGreaterThan(0.75)
    expect(far).toBeGreaterThan(1.1)
    expect(far).toBeLessThan(1.45)
  })

  it('银河给臂上成团的星更高的亮珠权重，权重都在 0~1', () => {
    const galaxy = galaxyShape(N, mulberry32(2))
    const beads = galaxy.beads!
    expect(beads).toHaveLength(N)
    let strong = 0
    for (const weight of beads) {
      expect(weight).toBeGreaterThanOrEqual(0)
      expect(weight).toBeLessThanOrEqual(1)
      if (weight > 0.5) strong += 1
    }
    expect(strong / N).toBeGreaterThan(0.2)
    expect(strong / N).toBeLessThan(0.6)
  })

  it('旋臂半径单调外扩：主体走到约 1，长臂末端稍稍外伸到约 1.25', () => {
    let previous = 0
    for (let theta = 0; theta <= ARM_MAIN + ARM_TAIL; theta += 0.1) {
      const r = armRadius(theta)
      expect(r).toBeGreaterThanOrEqual(previous)
      previous = r
    }
    expect(armRadius(ARM_MAIN)).toBeCloseTo(1, 5)
    expect(armRadius(ARM_MAIN + ARM_TAIL)).toBeCloseTo(1.25, 5)
  })

  it('matchPoints 返回一个排列，且比随机配对的平均位移短得多', () => {
    const a = galaxyShape(N, mulberry32(21)).points
    const b = constellationShape(N, mulberry32(22)).points
    const perm = matchPoints(a, b)
    expect([...perm].sort((x, y) => x - y)).toEqual(Array.from({ length: N }, (_, i) => i))
    const mean = (map: (i: number) => number) => {
      let sum = 0
      for (let i = 0; i < N; i += 1) {
        const j = map(i)
        sum += Math.hypot(a[i * 2]! - b[j * 2]!, a[i * 2 + 1]! - b[j * 2 + 1]!)
      }
      return sum / N
    }
    expect(mean((i) => perm[i]!)).toBeLessThan(mean((i) => i) * 0.6)
  })

  it('星座的点都落在某个节点附近或某条连线附近', () => {
    const nodes = new Map(CONSTELLATION_NODES.map((node) => [node.id, node]))
    const shape = constellationShape(N, mulberry32(3))
    expect(shape.glows).toHaveLength(CONSTELLATION_NODES.length)
    for (const edge of CONSTELLATION_EDGES) {
      expect(nodes.has(edge.from) && nodes.has(edge.to)).toBe(true)
    }
    for (let i = 0; i < N; i += 1) {
      const x = shape.points[i * 2]!
      const y = shape.points[i * 2 + 1]!
      expect(Math.abs(x)).toBeLessThan(1.6)
      expect(Math.abs(y)).toBeLessThan(1.1)
    }
  })

  it('字形蒙版只在不透明像素处取点；空蒙版退回星系', () => {
    // 左半边不透明的 8×8 蒙版：所有点都应在 x ≤ 0 一侧。
    const alpha = new Uint8Array(64)
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 4; x += 1) alpha[y * 8 + x] = 255
    const shape = glyphShape(N, mulberry32(5), { width: 8, height: 8, alpha })
    for (let i = 0; i < N; i += 1) expect(shape.points[i * 2]!).toBeLessThan(0.05)

    const empty = glyphShape(N, mulberry32(6), { width: 8, height: 8, alpha: new Uint8Array(64) })
    expect(empty.spin).toBe(true)
  })
})

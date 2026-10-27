import { describe, expect, it } from 'vitest'
import { LEVELS } from '../orchestrator/level'
import { SHOWCASE_LEVELS, SHOWCASE_VIEW, showcaseEdgePath } from './showcase'

describe('SHOWCASE_LEVELS', () => {
  it('依次覆盖 L0~L4，标签与预算取自 LEVELS', () => {
    expect(SHOWCASE_LEVELS.map((item) => item.level)).toEqual([0, 1, 2, 3, 4])
    for (const item of SHOWCASE_LEVELS) {
      expect(item.label).toBe(LEVELS[item.level].label)
      expect(item.budget).toBe(LEVELS[item.level].budget)
    }
  })

  it('子 Agent 数等于非系统、非工具节点数，且落在级别的节点范围内', () => {
    for (const item of SHOWCASE_LEVELS) {
      const agents = item.nodes.filter(
        (node) => node.family !== 'system' && node.family !== 'tool',
      ).length
      expect(agents).toBe(item.agents)
      // 审校节点不计入 maxNodes 之外的规划约束，这里只检查下限与上限。
      expect(agents).toBeGreaterThanOrEqual(LEVELS[item.level].minNodes)
      expect(agents).toBeLessThanOrEqual(LEVELS[item.level].maxNodes)
    }
  })

  it('节点 id 唯一、坐标在画布内，边的两端都存在且 id 唯一', () => {
    for (const item of SHOWCASE_LEVELS) {
      const ids = new Set(item.nodes.map((node) => node.id))
      expect(ids.size).toBe(item.nodes.length)
      for (const node of item.nodes) {
        expect(node.x).toBeGreaterThan(0)
        expect(node.x).toBeLessThan(SHOWCASE_VIEW.width)
        expect(node.y).toBeGreaterThan(0)
        expect(node.y).toBeLessThan(SHOWCASE_VIEW.height)
      }
      expect(new Set(item.edges.map((edge) => edge.id)).size).toBe(item.edges.length)
      for (const edge of item.edges) {
        expect(ids.has(edge.from)).toBe(true)
        expect(ids.has(edge.to)).toBe(true)
      }
    }
  })

  it('只有 L4 有返工边，只有 L1 有工具边', () => {
    for (const item of SHOWCASE_LEVELS) {
      expect(item.edges.some((edge) => edge.kind === 'feedback')).toBe(item.level === 4)
      expect(item.edges.some((edge) => edge.kind === 'tool')).toBe(item.level === 1)
    }
  })
})

describe('showcaseEdgePath', () => {
  it('所有路径都是 M + 单段 C 结构，便于插值', () => {
    for (const item of SHOWCASE_LEVELS) {
      const nodes = new Map(item.nodes.map((node) => [node.id, node]))
      for (const edge of item.edges) {
        const d = showcaseEdgePath(nodes.get(edge.from)!, nodes.get(edge.to)!, edge.kind)
        expect(d).toMatch(/^M [\d.-]+ [\d.-]+ C [\d.-]+ [\d.-]+, [\d.-]+ [\d.-]+, [\d.-]+ [\d.-]+$/)
      }
    }
  })
})

import type { Level } from '../contracts/common'
import { LEVELS } from '../orchestrator/level'

/** 首页「按需编排」演示图的数据：同一组节点 id 在不同级别间移动，形成形变动画。 */

export type ShowcaseFamily = 'system' | 'gather' | 'reason' | 'produce' | 'review' | 'tool'

export interface ShowcaseNode {
  id: string
  x: number
  y: number
  family: ShowcaseFamily
  label: string
}

export interface ShowcaseEdge {
  id: string
  from: string
  to: string
  kind: 'flow' | 'tool' | 'feedback'
}

export interface ShowcaseLevel {
  level: Level
  label: string
  agents: number
  summary: string
  budget: number
  nodes: ShowcaseNode[]
  edges: ShowcaseEdge[]
}

export const SHOWCASE_VIEW = { width: 560, height: 300 } as const
export const SHOWCASE_NODE_RADIUS = 18

const MID = SHOWCASE_VIEW.height / 2

const systemNodes: ShowcaseNode[] = [
  { id: 'task', x: 44, y: MID, family: 'system', label: '任务' },
  { id: 'router', x: 126, y: MID, family: 'system', label: '定级' },
  { id: 'output', x: 516, y: MID, family: 'system', label: '交付' },
]

function edge(from: string, to: string, kind: ShowcaseEdge['kind'] = 'flow'): ShowcaseEdge {
  return { id: `${from}>${to}${kind === 'flow' ? '' : `:${kind}`}`, from, to, kind }
}

function level(
  value: Level,
  agents: number,
  summary: string,
  nodes: ShowcaseNode[],
  edges: ShowcaseEdge[],
): ShowcaseLevel {
  return {
    level: value,
    label: LEVELS[value].label,
    agents,
    summary,
    budget: LEVELS[value].budget,
    nodes: [...systemNodes, ...nodes],
    edges: [edge('task', 'router'), ...edges],
  }
}

export const SHOWCASE_LEVELS: readonly ShowcaseLevel[] = [
  level(
    0,
    1,
    '简单问题不拉团队，一个子 Agent 直接回答',
    [{ id: 'a1', x: 320, y: MID, family: 'produce', label: '直答' }],
    [edge('router', 'a1'), edge('a1', 'output')],
  ),
  level(
    1,
    1,
    '需要精确计算时，子 Agent 主动调用工具',
    [
      { id: 'a1', x: 320, y: MID, family: 'reason', label: '计算' },
      { id: 'tool', x: 320, y: 58, family: 'tool', label: '计算器' },
    ],
    [edge('router', 'a1'), edge('a1', 'tool', 'tool'), edge('a1', 'output')],
  ),
  level(
    2,
    3,
    '有先后依赖的任务，三个子 Agent 串行接力',
    [
      { id: 'a1', x: 228, y: MID, family: 'gather', label: '调研' },
      { id: 'a2', x: 320, y: MID, family: 'reason', label: '分析' },
      { id: 'a3', x: 412, y: MID, family: 'produce', label: '写作' },
    ],
    [edge('router', 'a1'), edge('a1', 'a2'), edge('a2', 'a3'), edge('a3', 'output')],
  ),
  level(
    3,
    4,
    '可拆分的任务并行推进，再由一个子 Agent 汇总',
    [
      { id: 'a1', x: 250, y: 66, family: 'gather', label: '调研 A' },
      { id: 'a2', x: 250, y: MID, family: 'gather', label: '调研 B' },
      { id: 'a3', x: 250, y: 234, family: 'gather', label: '调研 C' },
      { id: 'a4', x: 400, y: MID, family: 'produce', label: '汇总' },
    ],
    [
      edge('router', 'a1'),
      edge('router', 'a2'),
      edge('router', 'a3'),
      edge('a1', 'a4'),
      edge('a2', 'a4'),
      edge('a3', 'a4'),
      edge('a4', 'output'),
    ],
  ),
  level(
    4,
    5,
    '高要求任务加上审校闸门，不通过就返工',
    [
      { id: 'a1', x: 226, y: 66, family: 'gather', label: '调研 A' },
      { id: 'a2', x: 226, y: MID, family: 'gather', label: '调研 B' },
      { id: 'a3', x: 226, y: 234, family: 'gather', label: '调研 C' },
      { id: 'a4', x: 330, y: MID, family: 'produce', label: '写作' },
      { id: 'review', x: 424, y: MID, family: 'review', label: '审校' },
    ],
    [
      edge('router', 'a1'),
      edge('router', 'a2'),
      edge('router', 'a3'),
      edge('a1', 'a4'),
      edge('a2', 'a4'),
      edge('a3', 'a4'),
      edge('a4', 'review'),
      edge('review', 'a4', 'feedback'),
      edge('review', 'output'),
    ],
  ),
]

/**
 * 两节点之间的三次贝塞尔路径。所有路径都是同一种 `M … C …` 结构，
 * 级别切换时可以直接插值 `d` 属性，让连线跟着节点平滑移动。
 */
export function showcaseEdgePath(from: ShowcaseNode, to: ShowcaseNode, kind: ShowcaseEdge['kind']) {
  const r = SHOWCASE_NODE_RADIUS
  if (kind === 'tool') {
    // 工具在节点正上方：竖直短线。
    const x = from.x
    return `M ${x} ${from.y - r} C ${x} ${from.y - r - 10}, ${x} ${to.y + r + 10}, ${x} ${to.y + r}`
  }
  if (kind === 'feedback') {
    // 返工意见从审校节点上方绕回写作节点。
    const lift = 58
    return `M ${from.x} ${from.y - r} C ${from.x} ${from.y - lift}, ${to.x} ${to.y - lift}, ${to.x} ${to.y - r}`
  }
  const x1 = from.x + r
  const x2 = to.x - r
  const mid = (x1 + x2) / 2
  return `M ${x1} ${from.y} C ${mid} ${from.y}, ${mid} ${to.y}, ${x2} ${to.y}`
}

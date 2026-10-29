import dagre from '@dagrejs/dagre'
import type { Lane } from '../contracts/plan'
import { LANES } from '../orchestrator/ultra'
import type { GraphNodeKind } from './derive-graph'

export const NODE_SIZE: Record<GraphNodeKind, { width: number; height: number }> = {
  task: { width: 144, height: 48 },
  router: { width: 144, height: 48 },
  planner: { width: 144, height: 48 },
  output: { width: 144, height: 48 },
  agent: { width: 216, height: 96 },
  /** Ultra 多路小卡：一个环节最多 5 路竖排，要能和择优、校准一起装进跟随镜头。 */
  lane: { width: 184, height: 60 },
  reviewer: { width: 184, height: 80 },
  judge: { width: 184, height: 80 },
  aligner: { width: 184, height: 80 },
}

/** 同一层相邻节点的间距。 */
const NODE_SEP = 24

/** Ultra 环节框的内边距；顶部多留一行放环节名。 */
export const GROUP_PADDING = { x: 14, top: 30, bottom: 14 }

export interface LayoutNodeInput {
  id: string
  kind: GraphNodeKind
  group?: string
  lane?: Lane
}

export interface LayoutEdgeInput {
  source: string
  target: string
}

export interface GroupBox {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/**
 * 分层布局，返回每个节点的**左上角**坐标（React Flow 需要的格式）。
 * 结果只依赖传入的拓扑，同一输入必然得到同一输出。
 * 节点带 group 时用 dagre 的复合图，同一环节的节点排在一起，互不穿插。
 */
export function layoutGraph(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  direction: 'LR' | 'TB',
): Map<string, { x: number; y: number }> {
  const compound = nodes.some((node) => node.group !== undefined)
  const graph = new dagre.graphlib.Graph(compound ? { compound: true } : undefined)
  graph.setGraph({ rankdir: direction, nodesep: NODE_SEP, ranksep: 56, marginx: 16, marginy: 16 })
  graph.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    const size = NODE_SIZE[node.kind]
    graph.setNode(node.id, { width: size.width, height: size.height })
  }
  if (compound) {
    for (const node of nodes) {
      if (node.group === undefined) {
        continue
      }
      const groupId = `group:${node.group}`
      if (!graph.hasNode(groupId)) {
        graph.setNode(groupId, { paddingTop: GROUP_PADDING.top })
      }
      graph.setParent(node.id, groupId)
    }
  }
  for (const edge of edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.setEdge(edge.source, edge.target)
    }
  }

  dagre.layout(graph)

  const positions = new Map<string, { x: number; y: number }>()
  for (const node of nodes) {
    const center = graph.node(node.id)
    const size = NODE_SIZE[node.kind]
    positions.set(node.id, {
      x: center.x - size.width / 2,
      y: center.y - size.height / 2,
    })
  }
  orderLanes(nodes, positions, direction)
  return positions
}

/**
 * dagre 只保证同一层内交叉最少，不保证各路的先后。同一环节的多路卡片尺寸相同、处在同一层，
 * 互换位置不影响连线，所以排完后统一按取向顺序从上到下（LR）或从左到右（TB）排列。
 */
function orderLanes(
  nodes: LayoutNodeInput[],
  positions: Map<string, { x: number; y: number }>,
  direction: 'LR' | 'TB',
): void {
  const axis = direction === 'LR' ? 'y' : 'x'
  const groups = new Map<string, LayoutNodeInput[]>()
  for (const node of nodes) {
    if (node.lane === undefined || node.group === undefined) continue
    groups.set(node.group, [...(groups.get(node.group) ?? []), node])
  }
  const pitch = (direction === 'LR' ? NODE_SIZE.lane.height : NODE_SIZE.lane.width) + NODE_SEP
  for (const members of groups.values()) {
    const slots = members
      .map((node) => positions.get(node.id))
      .filter((position): position is { x: number; y: number } => position !== undefined)
    if (slots.length === 0) continue
    // 汇合环节的各路会被 dagre 拉开去对齐多个上游，中间留出大片空白。
    // 以原位置的中心为准紧凑排列：新的跨度不超过原跨度，不会压到相邻环节。
    const center = slots.reduce((sum, slot) => sum + slot[axis], 0) / slots.length
    const start = center - ((slots.length - 1) * pitch) / 2
    const cross = slots[0]![direction === 'LR' ? 'x' : 'y']
    const ordered = [...members].sort(
      (a, b) => LANES.indexOf(a.lane as Lane) - LANES.indexOf(b.lane as Lane),
    )
    ordered.forEach((node, index) => {
      const along = Math.round((start + index * pitch) * 2) / 2
      positions.set(node.id, direction === 'LR' ? { x: cross, y: along } : { x: along, y: cross })
    })
  }
}

/** 按成员节点的实际位置算出每个 Ultra 环节框，顺序与节点首次出现的顺序一致。 */
export function groupBoxes(
  nodes: LayoutNodeInput[],
  positions: Map<string, { x: number; y: number }>,
): GroupBox[] {
  const boxes = new Map<string, { left: number; top: number; right: number; bottom: number }>()
  for (const node of nodes) {
    const position = positions.get(node.id)
    if (node.group === undefined || position === undefined) {
      continue
    }
    const size = NODE_SIZE[node.kind]
    const box = boxes.get(node.group)
    const right = position.x + size.width
    const bottom = position.y + size.height
    boxes.set(
      node.group,
      box === undefined
        ? { left: position.x, top: position.y, right, bottom }
        : {
            left: Math.min(box.left, position.x),
            top: Math.min(box.top, position.y),
            right: Math.max(box.right, right),
            bottom: Math.max(box.bottom, bottom),
          },
    )
  }
  return [...boxes].map(([id, box]) => ({
    id,
    x: box.left - GROUP_PADDING.x,
    y: box.top - GROUP_PADDING.top,
    width: box.right - box.left + GROUP_PADDING.x * 2,
    height: box.bottom - box.top + GROUP_PADDING.top + GROUP_PADDING.bottom,
  }))
}

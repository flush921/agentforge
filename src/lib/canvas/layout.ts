import dagre from '@dagrejs/dagre'
import type { GraphNodeKind } from './derive-graph'

export const NODE_SIZE: Record<GraphNodeKind, { width: number; height: number }> = {
  task: { width: 144, height: 48 },
  router: { width: 144, height: 48 },
  planner: { width: 144, height: 48 },
  output: { width: 144, height: 48 },
  agent: { width: 216, height: 96 },
  reviewer: { width: 184, height: 80 },
}

export interface LayoutNodeInput {
  id: string
  kind: GraphNodeKind
}

export interface LayoutEdgeInput {
  source: string
  target: string
}

/**
 * 分层布局，返回每个节点的**左上角**坐标（React Flow 需要的格式）。
 * 结果只依赖传入的拓扑，同一输入必然得到同一输出。
 */
export function layoutGraph(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  direction: 'LR' | 'TB',
): Map<string, { x: number; y: number }> {
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: direction, nodesep: 24, ranksep: 56, marginx: 16, marginy: 16 })
  graph.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    const size = NODE_SIZE[node.kind]
    graph.setNode(node.id, { width: size.width, height: size.height })
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
  return positions
}

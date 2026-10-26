import dagre from '@dagrejs/dagre'
import { describe, expect, it } from 'vitest'
import { sampleRunL0, sampleRunL4 } from '../fixtures/runs'
import { reduceEvents } from '../run/reducer'
import { deriveGraph } from './derive-graph'
import { layoutGraph, NODE_SIZE } from './layout'

function l4Graph() {
  return deriveGraph(reduceEvents(sampleRunL4))
}

describe('layoutGraph', () => {
  it('返回所有节点的左上角坐标', () => {
    const { nodes, edges } = l4Graph()
    const positions = layoutGraph(nodes, edges, 'LR')

    expect(positions.size).toBe(nodes.length)
    for (const node of nodes) {
      const position = positions.get(node.id)
      expect(position).toBeDefined()
      const size = NODE_SIZE[node.kind]
      expect(position!.x % 0.5).toBe(0)
      expect(position!.y % 0.5).toBe(0)
      expect(Number.isFinite(position!.x)).toBe(true)
      expect(Number.isFinite(position!.y)).toBe(true)
      expect(size.width).toBeGreaterThan(0)
    }
  })

  it('左上角 = dagre 中心点减去宽高的一半', () => {
    const { nodes, edges } = l4Graph()

    const graph = new dagre.graphlib.Graph()
    graph.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 56, marginx: 16, marginy: 16 })
    graph.setDefaultEdgeLabel(() => ({}))
    for (const node of nodes) {
      const size = NODE_SIZE[node.kind]
      graph.setNode(node.id, { width: size.width, height: size.height })
    }
    for (const edge of edges) {
      graph.setEdge(edge.source, edge.target)
    }
    dagre.layout(graph)

    const positions = layoutGraph(nodes, edges, 'LR')
    for (const node of nodes) {
      const center = graph.node(node.id)
      const size = NODE_SIZE[node.kind]
      expect(positions.get(node.id)).toEqual({
        x: center.x - size.width / 2,
        y: center.y - size.height / 2,
      })
    }
  })

  it('LR 下游 x 更大，TB 下游 y 更大', () => {
    const { nodes, edges } = l4Graph()

    const lr = layoutGraph(nodes, edges, 'LR')
    const tb = layoutGraph(nodes, edges, 'TB')
    for (const edge of edges) {
      expect(lr.get(edge.target)!.x).toBeGreaterThan(lr.get(edge.source)!.x)
      expect(tb.get(edge.target)!.y).toBeGreaterThan(tb.get(edge.source)!.y)
    }
  })

  it('同一输入两次调用结果相同', () => {
    const { nodes, edges } = l4Graph()
    const first = layoutGraph(nodes, edges, 'LR')
    const second = layoutGraph(nodes, edges, 'LR')

    expect(second.size).toBe(first.size)
    for (const [id, position] of first) {
      expect(second.get(id)).toEqual(position)
    }
  })

  it('L0 图也能布局', () => {
    const { nodes, edges } = deriveGraph(reduceEvents(sampleRunL0))
    const positions = layoutGraph(nodes, edges, 'TB')

    expect(positions.size).toBe(4)
    expect(positions.get('n:answer')!.y).toBeGreaterThan(positions.get('sys:router')!.y)
  })
})

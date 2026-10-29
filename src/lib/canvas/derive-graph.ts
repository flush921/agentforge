import type { AgentRole } from '../contracts/common'
import type { Lane, PlanNode } from '../contracts/plan'
import type { RunState } from '../run/types'

export type GraphNodeKind =
  'task' | 'router' | 'planner' | 'agent' | 'lane' | 'reviewer' | 'judge' | 'aligner' | 'output'
export type GraphStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  status: GraphStatus
  /** 指向计划节点 id：计划节点为自身 id，sys:output 为 outputNodeId */
  ref?: string
  guarded?: boolean
  /** Ultra 模式下所属的环节；同一环节的多路、择优、校准节点在画布上框在一起。 */
  group?: string
  /** Ultra 多路节点的取向，布局时按取向顺序排列。 */
  lane?: Lane
}

export type GraphEdgeKind = 'flow' | 'feedback' | 'fallback'

export interface GraphEdge {
  id: string
  source: string
  target: string
  kind: GraphEdgeKind
  active: boolean
  done: boolean
  /** Ultra 择优结果：被采用那一路到择优节点的边高亮，其余各路变暗。 */
  pick?: 'picked' | 'unpicked'
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

function routerStatus(state: RunState): GraphStatus {
  // 注意 reducer 在 assess.completed 之后、plan.started 之前 status 仍是 assessing，
  // 此时已有 decision，定级已完成，必须优先返回 completed。
  if (state.decision) {
    return 'completed'
  }
  if (state.status === 'assessing') {
    return 'running'
  }
  if (state.status === 'failed') {
    return 'failed'
  }
  if (state.status === 'cancelled') {
    return 'skipped'
  }
  return 'pending'
}

function plannerStatus(state: RunState): GraphStatus {
  if (state.status === 'planning') {
    return 'running'
  }
  if (state.plan) {
    return 'completed'
  }
  if (state.status === 'failed') {
    return 'failed'
  }
  if (state.status === 'cancelled') {
    return 'skipped'
  }
  return 'pending'
}

function outputStatus(state: RunState): GraphStatus {
  if (state.status === 'completed') {
    return 'completed'
  }
  if (state.status === 'failed') {
    return 'failed'
  }
  if (state.status === 'cancelled') {
    return 'skipped'
  }
  return 'pending'
}

function kindOf(node: PlanNode): GraphNodeKind {
  const role: AgentRole = node.role
  if (role === 'reviewer' || role === 'judge' || role === 'aligner') {
    return role
  }
  return node.ultra?.stage === 'lane' ? 'lane' : 'agent'
}

export function deriveGraph(state: RunState): Graph {
  if (state.runId === null) {
    return { nodes: [], edges: [] }
  }

  const nodes: GraphNode[] = [{ id: 'sys:task', kind: 'task', status: 'completed' }]
  const edges: GraphEdge[] = []

  const guarded = state.assessment?.guard !== undefined
  const hasPlanner = !guarded && (state.decision?.level ?? 0) >= 2
  nodes.push({
    id: 'sys:router',
    kind: 'router',
    status: routerStatus(state),
    ...(guarded ? { guarded: true } : {}),
  })
  if (hasPlanner) {
    nodes.push({ id: 'sys:planner', kind: 'planner', status: plannerStatus(state) })
  }

  const statusById = new Map<string, GraphStatus>(nodes.map((node) => [node.id, node.status]))
  const pushEdge = (source: string, target: string, kind: GraphEdgeKind) => {
    const id = `${kind}:${source}->${target}`
    if (edges.some((edge) => edge.id === id)) {
      return
    }
    edges.push({ id, source, target, kind, active: false, done: false })
  }

  pushEdge('sys:task', 'sys:router', 'flow')
  if (hasPlanner) {
    pushEdge('sys:router', 'sys:planner', 'flow')
  }
  const entry = hasPlanner ? 'sys:planner' : 'sys:router'

  const orderedNodes = state.nodeOrder.map((nodeId) => state.nodes[nodeId])
  for (const nodeState of orderedNodes) {
    if (!nodeState) {
      continue
    }

    const id = `n:${nodeState.node.id}`
    const group = nodeState.node.ultra?.group
    const lane = nodeState.node.ultra?.lane
    nodes.push({
      id,
      kind: kindOf(nodeState.node),
      status: nodeState.status,
      ref: nodeState.node.id,
      ...(group !== undefined ? { group } : {}),
      ...(lane !== undefined ? { lane } : {}),
    })
    statusById.set(id, nodeState.status)

    const deps = nodeState.node.dependsOn
    if (nodeState.revisionOf !== undefined) {
      const reviewerId = state.nodeOrder.find((candidateId) => {
        const candidate = state.nodes[candidateId]
        return (
          candidate?.node.role === 'reviewer' &&
          candidate.node.reviewTarget === nodeState.revisionOf
        )
      })
      if (reviewerId) {
        pushEdge(`n:${reviewerId}`, id, 'feedback')
        continue
      }
    }

    if (
      nodeState.dynamic &&
      nodeState.revisionOf === undefined &&
      nodeState.node.role !== 'reviewer'
    ) {
      if (deps.length === 0) {
        pushEdge(entry, id, 'fallback')
      } else {
        for (const dep of deps) {
          pushEdge(`n:${dep}`, id, 'fallback')
        }
      }
      continue
    }

    if (deps.length === 0) {
      pushEdge(entry, id, 'flow')
    } else {
      for (const dep of deps) {
        pushEdge(`n:${dep}`, id, 'flow')
      }
    }
  }

  if ((state.plan && state.outputNodeId) || guarded) {
    nodes.push({
      id: 'sys:output',
      kind: 'output',
      status: outputStatus(state),
      ...(state.outputNodeId !== undefined ? { ref: state.outputNodeId } : {}),
    })
    statusById.set('sys:output', outputStatus(state))

    if (guarded) {
      pushEdge('sys:router', 'sys:output', 'flow')
    } else if (state.outputNodeId !== undefined) {
      const gateId = [...state.nodeOrder]
        .reverse()
        .find((nodeId) => state.nodes[nodeId]?.node.reviewTarget === state.outputNodeId)
      const source = gateId ? `n:${gateId}` : `n:${state.outputNodeId}`
      pushEdge(source, 'sys:output', 'flow')
    }
  }

  for (const edge of edges) {
    edge.active = statusById.get(edge.target) === 'running'
    edge.done = statusById.get(edge.source) === 'completed'
    const target = state.nodes[edge.target.slice(2)]
    const winner = target?.node.role === 'judge' ? target.judge?.winner : undefined
    const source = state.nodes[edge.source.slice(2)]
    const lane = source?.node.ultra?.lane
    if (
      edge.target.startsWith('n:') &&
      winner !== undefined &&
      lane !== undefined &&
      source?.status === 'completed'
    ) {
      edge.pick = lane === winner ? 'picked' : 'unpicked'
    }
  }

  return { nodes, edges }
}

/**
 * 逐步显现：画布比执行快一步往前长。规划完成后起点环节立即出现；
 * 其余节点等任一上游开始工作才出现，已经开始或结束的节点始终可见。
 * 布局仍按整张图计算，节点出现时不会挤动已有节点。
 */
export function visibleNodeIds(state: RunState, graph: Graph): Set<string> {
  const terminal = ['completed', 'failed', 'cancelled'].includes(state.status)
  const visible = new Set<string>()
  for (const node of graph.nodes) {
    if (node.ref === undefined || node.kind === 'task' || node.kind === 'router') {
      if (node.kind !== 'output') visible.add(node.id)
      continue
    }
    if (node.kind === 'output') continue
    const nodeState = state.nodes[node.ref]
    if (nodeState === undefined) continue
    const deps = nodeState.node.dependsOn
    if (
      terminal ||
      nodeState.status !== 'pending' ||
      deps.length === 0 ||
      deps.some((dep) => (state.nodes[dep]?.status ?? 'pending') !== 'pending')
    ) {
      visible.add(node.id)
    }
  }
  // 交付节点在它的来源开始工作后出现。
  const outputEdge = graph.edges.find((edge) => edge.target === 'sys:output')
  const outputSource =
    outputEdge === undefined ? undefined : graph.nodes.find((node) => node.id === outputEdge.source)
  if (
    graph.nodes.some((node) => node.id === 'sys:output') &&
    (terminal || outputSource === undefined || outputSource.status !== 'pending')
  ) {
    visible.add('sys:output')
  }
  return visible
}

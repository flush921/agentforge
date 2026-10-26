import type { RunState } from '../run/types'

export type GraphNodeKind = 'task' | 'router' | 'planner' | 'agent' | 'reviewer' | 'output'
export type GraphStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  status: GraphStatus
  /** 指向计划节点 id：计划节点为自身 id，sys:output 为 outputNodeId */
  ref?: string
  guarded?: boolean
}

export type GraphEdgeKind = 'flow' | 'feedback' | 'fallback'

export interface GraphEdge {
  id: string
  source: string
  target: string
  kind: GraphEdgeKind
  active: boolean
  done: boolean
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
    nodes.push({
      id,
      kind: nodeState.node.role === 'reviewer' ? 'reviewer' : 'agent',
      status: nodeState.status,
      ref: nodeState.node.id,
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
  }

  return { nodes, edges }
}

'use client'

import type { Edge, Node } from '@xyflow/react'
import type { GraphEdgeKind, GraphNode } from '@/lib/canvas/derive-graph'
import type { NodeState, RunState } from '@/lib/run/types'

export type CanvasDirection = 'LR' | 'TB'

export type SystemNodeData = {
  graphNode: GraphNode
  runState: RunState
  direction: CanvasDirection
}

export type AgentNodeData = {
  graphNode: GraphNode
  nodeState: NodeState
  direction: CanvasDirection
  onOpen: (nodeId: string) => void
}

export type FlowEdgeData = {
  kind: GraphEdgeKind
  active: boolean
  done: boolean
  color: string
}

export type SystemFlowNode = Node<SystemNodeData, 'system'>
export type AgentFlowNode = Node<AgentNodeData, 'agent'>
export type ReviewerFlowNode = Node<AgentNodeData, 'reviewer'>
export type CanvasFlowNode = SystemFlowNode | AgentFlowNode | ReviewerFlowNode
export type CanvasFlowEdge = Edge<FlowEdgeData, 'flow'>

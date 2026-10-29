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
  /** Ultra 多路节点在择优中的结果。 */
  pick?: 'picked' | 'unpicked'
}

export type UltraGroupData = {
  group: string
  title: string
  lanes: number
  status: GraphNode['status']
  width: number
  height: number
}

export type FlowEdgeData = {
  kind: GraphEdgeKind
  active: boolean
  done: boolean
  color: string
  pick?: 'picked' | 'unpicked'
}

export type SystemFlowNode = Node<SystemNodeData, 'system'>
export type AgentFlowNode = Node<AgentNodeData, 'agent'>
export type ReviewerFlowNode = Node<AgentNodeData, 'reviewer'>
export type LaneFlowNode = Node<AgentNodeData, 'lane'>
export type UltraGateFlowNode = Node<AgentNodeData, 'ultraGate'>
export type UltraGroupFlowNode = Node<UltraGroupData, 'ultraGroup'>
export type CanvasFlowNode =
  | SystemFlowNode
  | AgentFlowNode
  | ReviewerFlowNode
  | LaneFlowNode
  | UltraGateFlowNode
  | UltraGroupFlowNode
export type CanvasFlowEdge = Edge<FlowEdgeData, 'flow'>

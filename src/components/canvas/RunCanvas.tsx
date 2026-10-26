'use client'

import '@xyflow/react/dist/style.css'

import { useEffect, useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react'
import { MotionConfig, useReducedMotion } from 'motion/react'
import { deriveGraph, type GraphEdge, type GraphNode } from '@/lib/canvas/derive-graph'
import { roleInfo } from '@/lib/canvas/format'
import { layoutGraph, NODE_SIZE } from '@/lib/canvas/layout'
import type { RunState } from '@/lib/run/types'
import { FlowEdge } from './edges/FlowEdge'
import { AgentNode } from './nodes/AgentNode'
import { ReviewerNode } from './nodes/ReviewerNode'
import { SystemNode } from './nodes/SystemNode'
import type { CanvasFlowEdge, CanvasFlowNode } from './types'

const nodeTypes: NodeTypes = { system: SystemNode, agent: AgentNode, reviewer: ReviewerNode }
const edgeTypes: EdgeTypes = { flow: FlowEdge }

function edgeColor(edge: GraphEdge, source: GraphNode | undefined, state: RunState): string {
  if (edge.active) return 'var(--brand)'
  if (edge.kind === 'feedback') return 'var(--warning)'
  if (edge.kind === 'fallback') return 'var(--ink-muted)'
  if (!edge.done) return 'var(--edge)'
  if (source?.ref !== undefined && (source.kind === 'agent' || source.kind === 'reviewer')) {
    const nodeState = state.nodes[source.ref]
    if (nodeState !== undefined) return `var(--role-${roleInfo(nodeState.node.role).family})`
  }
  return 'var(--brand)'
}

function CanvasFlow({
  state,
  onOpen,
  instantFit,
}: {
  state: RunState
  onOpen: (nodeId: string) => void
  instantFit: boolean
}) {
  const width = useStore((store) => store.width)
  const direction = width > 0 && width < 720 ? 'TB' : 'LR'
  const reducedMotion = useReducedMotion()
  const { fitView, viewportInitialized } = useReactFlow<CanvasFlowNode, CanvasFlowEdge>()
  const graph = useMemo(() => deriveGraph(state), [state])
  const topologyKey = useMemo(
    () =>
      `${graph.nodes.map((node) => `${node.id}:${node.kind}`).join('|')}//${graph.edges
        .map((edge) => edge.id)
        .join('|')}`,
    [graph],
  )
  const positions = useMemo(
    () => layoutGraph(graph.nodes, graph.edges, direction),
    // 流式更新会更换 graph 引用，但布局输入只有拓扑键和方向。
    [topologyKey, direction], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    if (!viewportInitialized || topologyKey.length === 0) return
    void fitView({
      padding: 0.18,
      maxZoom: 1,
      includeHiddenNodes: true,
      duration: reducedMotion || instantFit ? 0 : 500,
    })
  }, [fitView, viewportInitialized, instantFit, reducedMotion, topologyKey, direction])

  const nodes = useMemo<CanvasFlowNode[]>(
    () =>
      graph.nodes
        .map((graphNode): CanvasFlowNode | null => {
          const position = positions.get(graphNode.id) ?? { x: 0, y: 0 }
          const base = {
            id: graphNode.id,
            position,
            width: NODE_SIZE[graphNode.kind].width,
            height: NODE_SIZE[graphNode.kind].height,
            sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
            targetPosition: direction === 'LR' ? Position.Left : Position.Top,
          }
          if (graphNode.kind === 'agent' || graphNode.kind === 'reviewer') {
            const nodeState = graphNode.ref === undefined ? undefined : state.nodes[graphNode.ref]
            if (nodeState === undefined) return null
            return {
              ...base,
              type: graphNode.kind,
              data: { graphNode, nodeState, direction, onOpen },
            }
          }
          return {
            ...base,
            type: 'system',
            data: { graphNode, runState: state, direction },
          }
        })
        .filter((node): node is CanvasFlowNode => node !== null),
    [direction, graph, onOpen, positions, state],
  )

  const edges = useMemo<CanvasFlowEdge[]>(
    () =>
      graph.edges.map((edge) => {
        const color = edgeColor(
          edge,
          graph.nodes.find((node) => node.id === edge.source),
          state,
        )
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'flow',
          data: { kind: edge.kind, active: edge.active, done: edge.done, color },
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color },
        }
      }),
    [graph, state],
  )

  return (
    <ReactFlow<CanvasFlowNode, CanvasFlowEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.18, maxZoom: 1, includeHiddenNodes: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      elementsSelectable={false}
      edgesFocusable={false}
      edgesReconnectable={false}
      autoPanOnNodeFocus={false}
      deleteKeyCode={null}
      minZoom={0.15}
      maxZoom={1.6}
      colorMode="dark"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--grid-dot)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

export function RunCanvas({
  state,
  onOpen,
  instantFit = false,
}: {
  state: RunState
  onOpen: (nodeId: string) => void
  instantFit?: boolean
}) {
  return (
    <MotionConfig reducedMotion="user">
      <div
        role="region"
        aria-label="编排画布"
        className="h-full min-h-[360px] w-full overflow-hidden rounded-2xl border border-border bg-background"
      >
        <ReactFlowProvider>
          <CanvasFlow state={state} onOpen={onOpen} instantFit={instantFit} />
        </ReactFlowProvider>
      </div>
    </MotionConfig>
  )
}

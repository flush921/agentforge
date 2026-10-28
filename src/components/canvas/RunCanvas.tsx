'use client'

import '@xyflow/react/dist/style.css'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ControlButton,
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
import { Crosshair, Scan } from 'lucide-react'
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

export type CameraMode = 'follow' | 'overview' | 'manual'

const OVERVIEW_PADDING = 0.08
/** 低于这个缩放，卡片文字就读不清了。 */
const READABLE_ZOOM = 0.55

function CanvasFlow({
  state,
  onOpen,
  instantFit,
  initialCamera,
}: {
  state: RunState
  onOpen: (nodeId: string) => void
  instantFit: boolean
  initialCamera: CameraMode
}) {
  const [cameraMode, setCameraMode] = useState<CameraMode>(initialCamera)
  // 全览分两种：用户点「全览」或确认计划时完整框住全图；运行结束自动切换时，
  // 图太长就以可读的最低缩放对准收尾部分（审校、返工与交付），其余可拖动查看。
  const [overviewAll, setOverviewAll] = useState(initialCamera === 'overview')
  const width = useStore((store) => store.width)
  const height = useStore((store) => store.height)
  const direction = width > 0 && width < 720 ? 'TB' : 'LR'
  const reducedMotion = useReducedMotion()
  const { fitView, getNodes, getNodesBounds, setViewport, viewportInitialized } = useReactFlow<
    CanvasFlowNode,
    CanvasFlowEdge
  >()
  const graph = useMemo(() => deriveGraph(state), [state])
  const topologyKey = useMemo(
    () =>
      `${graph.nodes.map((node) => `${node.id}:${node.kind}`).join('|')}//${graph.edges
        .map((edge) => edge.id)
        .join('|')}`,
    [graph],
  )
  const focusKey = useMemo(() => {
    const running = new Set(
      graph.nodes.filter((node) => node.status === 'running').map((node) => node.id),
    )
    const focus = new Set(running)
    // 镜头框住运行节点及其直接上下游：既看清材料来源，也知道下一步交给谁。
    for (const edge of graph.edges) {
      if (running.has(edge.target)) focus.add(edge.source)
      if (running.has(edge.source)) focus.add(edge.target)
    }
    return [...focus].sort().join('|')
  }, [graph])
  const terminal = ['completed', 'failed', 'cancelled'].includes(state.status)
  const previousTerminal = useRef<boolean | undefined>(undefined)
  const cameraLayoutKey = graph.nodes.length === 0 ? '' : `${topologyKey}@${direction}`
  const positions = useMemo(
    () => layoutGraph(graph.nodes, graph.edges, direction),
    // 流式更新会更换 graph 引用，但布局输入只有拓扑键和方向。
    [topologyKey, direction], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    if (terminal && previousTerminal.current !== true) {
      setCameraMode('overview')
      setOverviewAll(false)
    } else if (!terminal && previousTerminal.current === true) {
      setCameraMode((mode) => (mode === 'manual' ? 'manual' : 'follow'))
    }
    previousTerminal.current = terminal
  }, [terminal])

  // 镜头只跟随焦点、拓扑和方向变化，不能随流式文字移动。
  useEffect(() => {
    if (!viewportInitialized || cameraLayoutKey.length === 0) return
    const duration = reducedMotion || instantFit ? 0 : 600
    if (cameraMode === 'overview') {
      const nodes = getNodes()
      const bounds = getNodesBounds(nodes)
      const fitZoom = Math.min(
        width / (bounds.width * (1 + OVERVIEW_PADDING * 2)),
        height / (bounds.height * (1 + OVERVIEW_PADDING * 2)),
      )
      if (overviewAll || nodes.length === 0 || !(fitZoom < READABLE_ZOOM)) {
        void fitView({
          padding: OVERVIEW_PADDING,
          maxZoom: 1,
          includeHiddenNodes: true,
          duration,
        })
        return
      }
      const zoom = READABLE_ZOOM
      const margin = 24
      void setViewport(
        direction === 'LR'
          ? {
              x: width - margin - (bounds.x + bounds.width) * zoom,
              y: height / 2 - (bounds.y + bounds.height / 2) * zoom,
              zoom,
            }
          : {
              x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
              y: height - margin - (bounds.y + bounds.height) * zoom,
              zoom,
            },
        { duration },
      )
      return
    }
    if (cameraMode === 'manual' || focusKey.length === 0) return
    const focusIds = new Set(focusKey.split('|'))
    const focusNodes = getNodes().filter((node) => focusIds.has(node.id))
    if (focusNodes.length === 0) return
    void fitView({
      nodes: focusNodes,
      padding: 0.3,
      maxZoom: 1,
      minZoom: 0.55,
      includeHiddenNodes: true,
      duration,
    })
  }, [
    cameraLayoutKey,
    cameraMode,
    direction,
    fitView,
    focusKey,
    getNodes,
    getNodesBounds,
    height,
    instantFit,
    overviewAll,
    reducedMotion,
    setViewport,
    viewportInitialized,
    width,
  ])

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
      fitViewOptions={{ padding: 0.08, maxZoom: 1, includeHiddenNodes: true }}
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
      onMoveStart={(event) => {
        if (event !== null) setCameraMode('manual')
      }}
    >
      <Background
        id="canvas-dots"
        variant={BackgroundVariant.Dots}
        gap={22}
        size={1.2}
        color="var(--grid-dot)"
      />
      <Background
        id="canvas-grid"
        variant={BackgroundVariant.Lines}
        gap={176}
        lineWidth={0.6}
        color="color-mix(in oklab, var(--brand) 9%, transparent)"
      />
      <Controls
        showInteractive={false}
        showFitView={false}
        onZoomIn={() => setCameraMode('manual')}
        onZoomOut={() => setCameraMode('manual')}
      >
        <ControlButton
          title="跟随"
          aria-label="跟随"
          aria-pressed={cameraMode === 'follow'}
          disabled={terminal}
          className={cameraMode === 'follow' ? '!text-brand' : undefined}
          onClick={() => setCameraMode('follow')}
        >
          <Crosshair className="size-4" aria-hidden />
        </ControlButton>
        <ControlButton
          title="全览"
          aria-label="全览"
          aria-pressed={cameraMode === 'overview'}
          className={cameraMode === 'overview' ? '!text-brand' : undefined}
          onClick={() => {
            setOverviewAll(true)
            setCameraMode('overview')
          }}
        >
          <Scan className="size-4" aria-hidden />
        </ControlButton>
      </Controls>
    </ReactFlow>
  )
}

export function RunCanvas({
  state,
  onOpen,
  instantFit = false,
  initialCamera = 'follow',
}: {
  state: RunState
  onOpen: (nodeId: string) => void
  instantFit?: boolean
  initialCamera?: CameraMode
}) {
  return (
    <MotionConfig reducedMotion="user">
      <div
        role="region"
        aria-label="编排画布"
        className="canvas-stage h-full min-h-[360px] w-full overflow-hidden rounded-2xl border border-white/[0.06]"
      >
        <ReactFlowProvider>
          <CanvasFlow
            state={state}
            onOpen={onOpen}
            instantFit={instantFit}
            initialCamera={initialCamera}
          />
        </ReactFlowProvider>
      </div>
    </MotionConfig>
  )
}

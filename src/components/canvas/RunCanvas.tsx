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
import {
  deriveGraph,
  visibleNodeIds,
  type GraphEdge,
  type GraphNode,
} from '@/lib/canvas/derive-graph'
import { roleInfo } from '@/lib/canvas/format'
import { groupBoxes, layoutGraph, NODE_SIZE } from '@/lib/canvas/layout'
import { laneOutcome, lanesOf } from '@/lib/orchestrator/ultra'
import type { RunState } from '@/lib/run/types'
import { FlowEdge } from './edges/FlowEdge'
import { AgentNode } from './nodes/AgentNode'
import { LaneNode } from './nodes/LaneNode'
import { ReviewerNode } from './nodes/ReviewerNode'
import { SystemNode } from './nodes/SystemNode'
import { UltraGateNode } from './nodes/UltraGateNode'
import { UltraGroupNode } from './nodes/UltraGroupNode'
import type { CanvasFlowEdge, CanvasFlowNode } from './types'

const nodeTypes: NodeTypes = {
  system: SystemNode,
  agent: AgentNode,
  reviewer: ReviewerNode,
  lane: LaneNode,
  ultraGate: UltraGateNode,
  ultraGroup: UltraGroupNode,
}
const edgeTypes: EdgeTypes = { flow: FlowEdge }

function edgeColor(edge: GraphEdge, source: GraphNode | undefined, state: RunState): string {
  if (edge.pick === 'picked') return 'var(--ultra)'
  if (edge.pick === 'unpicked') return 'var(--ink-muted)'
  if (edge.active) return 'var(--brand)'
  if (edge.kind === 'feedback') return 'var(--warning)'
  if (edge.kind === 'fallback') return 'var(--ink-muted)'
  if (!edge.done) return 'var(--edge)'
  if (source?.ref !== undefined && source.kind !== 'task' && source.kind !== 'output') {
    const nodeState = state.nodes[source.ref]
    if (nodeState !== undefined) return `var(--role-${roleInfo(nodeState.node.role).family})`
  }
  return 'var(--brand)'
}

export type CameraMode = 'follow' | 'overview' | 'manual'

const OVERVIEW_PADDING = 0.08
/** 低于这个缩放，卡片文字就读不清了。 */
const READABLE_ZOOM = 0.55
/** 为了框住整个最终 Ultra 环节，收尾视角最多缩到这里。 */
const TAIL_MIN_ZOOM = 0.42
/** 左下角缩放按钮占用的宽度（含边距）。 */
const CONTROLS_GUTTER = 72
/** Ultra 起步时二十来路同时在跑，跟随镜头允许缩到这里，把整片并行框进来。 */
const ULTRA_FOLLOW_MIN_ZOOM = 0.3

function CanvasFlow({
  state,
  onOpen,
  instantFit,
  initialCamera,
  revealAll,
}: {
  state: RunState
  onOpen: (nodeId: string) => void
  instantFit: boolean
  initialCamera: CameraMode
  revealAll: boolean
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
  // 逐步显现：执行前确认时展示整张计划，其余时候只显示已经轮到的部分。
  const visible = useMemo(
    () => (revealAll ? undefined : visibleNodeIds(state, graph)),
    [graph, revealAll, state],
  )
  const isHidden = (id: string) => visible !== undefined && !visible.has(id)
  const visibleKey = visible === undefined ? 'all' : [...visible].sort().join('|')
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
    // Ultra 一次有十几路在跑，再带上上游会把镜头拉得太远；只框运行节点和它们的下一站。
    for (const edge of graph.edges) {
      if (running.has(edge.target) && !state.ultra) focus.add(edge.source)
      if (running.has(edge.source)) focus.add(edge.target)
    }
    // 还没显现的节点不能把镜头拉向空白处。
    return [...focus]
      .filter((id) => visible === undefined || visible.has(id))
      .sort()
      .join('|')
  }, [graph, state.ultra, visible])
  const terminal = ['completed', 'failed', 'cancelled'].includes(state.status)
  const previousTerminal = useRef<boolean | undefined>(undefined)
  // 镜头第一次对准内容之前，视口还是默认位置；此时先把当前已有的节点完整框进来。
  const hasAimed = useRef(false)
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
      hasAimed.current = true
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
      const margin = 24
      // Ultra 的最终环节框比普通卡片宽得多；收尾视角要把它完整框进来，必要时略低于可读缩放。
      const tailGroup =
        state.plan === undefined
          ? undefined
          : nodes.find((node) => node.id === `group:${state.plan?.outputNodeId}`)
      const span =
        tailGroup === undefined
          ? undefined
          : direction === 'LR'
            ? bounds.x + bounds.width - tailGroup.position.x
            : bounds.y + bounds.height - tailGroup.position.y
      // 左下角是缩放按钮，横向布局时收尾部分要让出这块宽度，不能被按钮挡住。
      const room = direction === 'LR' ? width - margin - CONTROLS_GUTTER : height - margin * 2
      const zoom =
        span === undefined
          ? READABLE_ZOOM
          : Math.max(TAIL_MIN_ZOOM, Math.min(READABLE_ZOOM, room / span))
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
    if (cameraMode === 'manual') return
    if (focusKey.length === 0) {
      if (!hasAimed.current) {
        hasAimed.current = true
        void fitView({
          padding: OVERVIEW_PADDING,
          maxZoom: 1,
          includeHiddenNodes: true,
          duration: 0,
        })
      }
      return
    }
    hasAimed.current = true
    const focusIds = new Set(focusKey.split('|'))
    const focusNodes = getNodes().filter((node) => focusIds.has(node.id))
    if (focusNodes.length === 0) return
    void fitView({
      nodes: focusNodes,
      // Ultra 镜头贴得近，左边多留出缩放按钮的宽度，卡片不会被按钮挡住。
      padding: state.ultra
        ? { top: '28px', right: '28px', bottom: '28px', left: `${CONTROLS_GUTTER}px` }
        : 0.3,
      maxZoom: 1,
      minZoom: state.ultra ? ULTRA_FOLLOW_MIN_ZOOM : 0.55,
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
    state.plan,
    state.ultra,
    viewportInitialized,
    width,
  ])

  // 环节框只框已经显现的成员，随逐步显现一起往前长。
  const groups = useMemo(
    () =>
      groupBoxes(
        visible === undefined ? graph.nodes : graph.nodes.filter((node) => visible.has(node.id)),
        positions,
      ),
    // 环节框只随布局和显现范围变化。
    [positions, visibleKey], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const nodes = useMemo<CanvasFlowNode[]>(
    () => [
      // 环节框排在最前面，渲染在卡片下层。
      ...groups.map((box): CanvasFlowNode => {
        const members = graph.nodes.filter((node) => node.group === box.id)
        const lanes = members.filter((node) => node.kind === 'lane').length
        const aligner = members.find((node) => node.kind === 'aligner')
        const status = members.some((node) => node.status === 'running')
          ? 'running'
          : (aligner?.status ?? 'pending')
        const base = state.plan?.nodes.find((node) => node.id === box.id)
        return {
          id: `group:${box.id}`,
          type: 'ultraGroup',
          position: { x: box.x, y: box.y },
          width: box.width,
          height: box.height,
          zIndex: -1,
          selectable: false,
          draggable: false,
          hidden: members.every((node) => isHidden(node.id)),
          data: {
            group: box.id,
            title: base?.title ?? box.id,
            lanes,
            status,
            width: box.width,
            height: box.height,
          },
        }
      }),
      ...graph.nodes
        .map((graphNode): CanvasFlowNode | null => {
          const position = positions.get(graphNode.id) ?? { x: 0, y: 0 }
          const base = {
            id: graphNode.id,
            position,
            width: NODE_SIZE[graphNode.kind].width,
            height: NODE_SIZE[graphNode.kind].height,
            sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
            targetPosition: direction === 'LR' ? Position.Left : Position.Top,
            hidden: isHidden(graphNode.id),
          }
          if (
            graphNode.kind === 'agent' ||
            graphNode.kind === 'lane' ||
            graphNode.kind === 'reviewer' ||
            graphNode.kind === 'judge' ||
            graphNode.kind === 'aligner'
          ) {
            const nodeState = graphNode.ref === undefined ? undefined : state.nodes[graphNode.ref]
            if (nodeState === undefined) return null
            const pick = laneOutcome(state, nodeState.node)
            const lanesFinished =
              nodeState.node.role === 'judge'
                ? lanesOf(state, nodeState.node).filter((lane) => lane.status === 'completed')
                    .length
                : undefined
            return {
              ...base,
              type:
                graphNode.kind === 'judge' || graphNode.kind === 'aligner'
                  ? 'ultraGate'
                  : graphNode.kind,
              data: {
                graphNode,
                nodeState,
                direction,
                onOpen,
                ...(pick !== undefined ? { pick } : {}),
                ...(lanesFinished !== undefined ? { lanesFinished } : {}),
              },
            }
          }
          return {
            ...base,
            type: 'system',
            data: { graphNode, runState: state, direction },
          }
        })
        .filter((node): node is CanvasFlowNode => node !== null),
    ],
    [direction, graph, groups, onOpen, positions, state, visible], // eslint-disable-line react-hooks/exhaustive-deps
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
          data: {
            kind: edge.kind,
            active: edge.active,
            done: edge.done,
            color,
            ...(edge.pick !== undefined ? { pick: edge.pick } : {}),
          },
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
      // 不能打开 ReactFlow 自带的 fitView：它会在节点测量完成后把整张图重新塞回视口，
      // 覆盖掉上面按状态决定的镜头（跟随 / 可读缩放的收尾视角 / 全览）。镜头只由上面的 effect 控制。
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
  revealAll = false,
}: {
  state: RunState
  onOpen: (nodeId: string) => void
  instantFit?: boolean
  initialCamera?: CameraMode
  /** 关闭逐步显现，一次画出整张计划（执行前确认时使用）。 */
  revealAll?: boolean
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
            revealAll={revealAll}
          />
        </ReactFlowProvider>
      </div>
    </MotionConfig>
  )
}

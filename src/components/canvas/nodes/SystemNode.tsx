'use client'

import { memo } from 'react'
import { Flag, Gauge, MessageSquare, Workflow } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { LEVELS } from '@/lib/orchestrator/level'
import { cn } from '@/lib/utils'
import type { SystemFlowNode } from '../types'
import { CanvasHandles } from './shared'
import type { NodeProps } from '@xyflow/react'

const systemIcons = { task: MessageSquare, router: Gauge, planner: Workflow, output: Flag }

function SystemNodeView({ data }: NodeProps<SystemFlowNode>) {
  const { graphNode, runState, direction } = data
  const reducedMotion = useReducedMotion()
  const Icon = systemIcons[graphNode.kind as keyof typeof systemIcons]
  const level = runState.decision?.level
  let title = '任务'
  let detail = runState.task.length > 14 ? `${runState.task.slice(0, 14)}…` : runState.task

  if (graphNode.kind === 'router') {
    title = '评估定级'
    detail = graphNode.guarded
      ? runState.assessment?.guard?.kind === 'crisis'
        ? '我们在这里'
        : '已拦截'
      : level === undefined
        ? '评估中'
        : runState.decision?.ultra === true
          ? `L${level} · 超编排`
          : `L${level} · ${LEVELS[level].label}`
  } else if (graphNode.kind === 'planner') {
    title = '规划'
    detail =
      runState.status === 'planning'
        ? '规划中…'
        : runState.planSource === 'fallback'
          ? '已退回单子 Agent'
          : runState.ultra && runState.plan?.level === 4
            ? `${runState.plan.nodes.length} 环节 → ${runState.nodeOrder.length} Agent`
            : `${runState.plan?.nodes.length ?? 0} 个环节`
  } else if (graphNode.kind === 'output') {
    title = '交付'
    detail =
      runState.status === 'completed'
        ? runState.degraded
          ? '已降级交付'
          : '已交付'
        : runState.status === 'failed'
          ? '失败'
          : runState.status === 'cancelled'
            ? '已取消'
            : '生成中'
  }

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reducedMotion ? 0 : 0.32 }}
      data-status={graphNode.status}
      className={cn(
        'canvas-system-node flex h-12 w-36 items-center gap-2.5 rounded-full border border-brand/20 bg-panel/90 px-3 shadow-lg shadow-black/30 backdrop-blur',
        graphNode.status === 'running' && 'border-brand/70 shadow-[0_0_24px_-6px_var(--brand)]',
        graphNode.status === 'completed' && 'border-brand/35',
        graphNode.status === 'failed' && 'border-danger/70',
      )}
    >
      <CanvasHandles direction={direction} />
      <Icon className="size-5 shrink-0 text-brand" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] font-medium">
          <span>{title}</span>
          {graphNode.kind === 'planner' && runState.planFailures.length > 0 ? (
            <span className="rounded bg-warning/10 px-1 text-[9px] text-warning">
              修复 ×{runState.planFailures.length}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            'block truncate text-[11px] text-text-secondary',
            graphNode.kind === 'planner' && runState.planSource === 'fallback' && 'text-warning',
          )}
          title={detail}
        >
          {detail}
        </span>
      </span>
    </motion.div>
  )
}

export const SystemNode = memo(SystemNodeView, (previous, next) => {
  const a = previous.data
  const b = next.data
  if (a.graphNode.status !== b.graphNode.status || a.direction !== b.direction) return false
  if (a.graphNode.kind !== b.graphNode.kind) return false
  if (a.graphNode.kind === 'task') return a.runState.task === b.runState.task
  if (a.graphNode.kind === 'router') {
    return (
      a.graphNode.guarded === b.graphNode.guarded &&
      a.runState.status === b.runState.status &&
      a.runState.assessment === b.runState.assessment &&
      a.runState.decision === b.runState.decision
    )
  }
  if (a.graphNode.kind === 'planner') {
    return (
      a.runState.status === b.runState.status &&
      a.runState.plan === b.runState.plan &&
      a.runState.planFailures === b.runState.planFailures &&
      a.runState.planSource === b.runState.planSource &&
      a.runState.nodeOrder.length === b.runState.nodeOrder.length
    )
  }
  return a.runState.status === b.runState.status && a.runState.degraded === b.runState.degraded
})

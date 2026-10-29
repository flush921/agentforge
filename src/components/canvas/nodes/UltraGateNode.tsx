'use client'

import { memo, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { NodeProps } from '@xyflow/react'
import { isTie, LANE_LABELS, totalScore } from '@/lib/orchestrator/ultra'
import type { NodeState } from '@/lib/run/types'
import { cn } from '@/lib/utils'
import { roleIcons } from '../role-icons'
import type { UltraGateFlowNode } from '../types'
import { AgentStatusLine, CanvasHandles, NodeBadge, nodeStatusLabel, sameAgentData } from './shared'

function JudgeDetail({
  nodeState,
  finished,
}: {
  nodeState: NodeState
  finished: number | undefined
}): ReactNode {
  const result = nodeState.judge
  const lanes = nodeState.node.dependsOn.length
  if (result === undefined) {
    return <span className="text-text-secondary">第一层 · {lanes} 路择优</span>
  }
  const picked = result.scores?.find((item) => item.lane === result.winner)
  return (
    <span className="flex items-center gap-1">
      <span className="font-semibold text-ultra">采用「{LANE_LABELS[result.winner]}」</span>
      {finished !== undefined && finished < lanes ? (
        <span className="text-warning">
          {finished}/{lanes} 路完成
        </span>
      ) : null}
      {picked !== undefined ? (
        <span className="font-mono text-ink-muted">
          {totalScore(picked.scores)}/30
          {result.scores !== undefined && isTie(result.scores) ? ' 并列' : ''}
        </span>
      ) : null}
    </span>
  )
}

function AlignDetail({ nodeState }: { nodeState: NodeState }): ReactNode {
  const result = nodeState.align
  if (result === undefined) {
    return <span className="text-text-secondary">第二层 · 对照整体目标</span>
  }
  return (
    <span className={result.aligned ? 'text-success' : 'text-warning'}>
      方向 {result.score}/10 · {result.aligned ? '一致，沿用' : `纠偏 ${result.drift.length} 处`}
    </span>
  )
}

function UltraGateNodeView({ data }: NodeProps<UltraGateFlowNode>) {
  const { nodeState, direction, onOpen } = data
  const reducedMotion = useReducedMotion()
  const judge = nodeState.node.role === 'judge'
  const Icon = roleIcons[nodeState.node.role]
  const label = judge ? '多路择优' : '方向校准'

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reducedMotion ? 0 : 0.32 }}
    >
      <CanvasHandles direction={direction} />
      <button
        type="button"
        aria-label={`环节：${nodeState.node.title}，${label}，${nodeStatusLabel[nodeState.status]}`}
        onClick={() => onOpen(nodeState.node.id)}
        data-status={nodeState.status}
        data-ultra-gate={judge ? 'judge' : 'align'}
        style={{ '--node-accent': 'var(--ultra)' } as React.CSSProperties}
        className="canvas-agent-card ultra-gate nodrag nopan relative flex h-20 w-[184px] flex-col overflow-hidden rounded-[14px] border border-ultra/30 px-3 py-2 text-left shadow-lg shadow-black/30 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span aria-hidden className="canvas-card-accent absolute inset-x-0 top-0 h-[2px]" />
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center border-2 border-ultra/70 bg-background/60',
              judge ? 'ultra-hex' : 'keep-round rounded-full',
            )}
          >
            <Icon className="size-4 text-ultra" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1">
              <span className="truncate text-[13px] font-semibold text-text-primary">
                {nodeState.node.title}
              </span>
              {nodeState.attempt > 1 ? (
                <NodeBadge warning>重试 {nodeState.attempt}</NodeBadge>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-[10px]">
              {judge ? (
                <JudgeDetail nodeState={nodeState} finished={data.lanesFinished} />
              ) : (
                <AlignDetail nodeState={nodeState} />
              )}
            </span>
          </span>
        </span>
        <span className="mt-auto">
          <AgentStatusLine nodeState={nodeState} />
        </span>
      </button>
    </motion.div>
  )
}

export const UltraGateNode = memo(UltraGateNodeView, (previous, next) =>
  sameAgentData(previous.data, next.data),
)

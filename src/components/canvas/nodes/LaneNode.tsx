'use client'

import { memo } from 'react'
import {
  Check,
  Layers,
  Lightbulb,
  Microscope,
  Rocket,
  Telescope,
  type LucideIcon,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { NodeProps } from '@xyflow/react'
import type { Lane } from '@/lib/contracts/plan'
import { formatTokens } from '@/lib/canvas/format'
import { agentSummary } from '@/lib/canvas/summary'
import { LANE_LABELS } from '@/lib/orchestrator/ultra'
import { cn } from '@/lib/utils'
import type { LaneFlowNode } from '../types'
import {
  CanvasHandles,
  NodeStatusIcon,
  nodeStatusLabel,
  sameAgentData,
  statusColor,
} from './shared'

const LANE_ICONS: Record<Lane, LucideIcon> = {
  rigor: Microscope,
  depth: Telescope,
  practical: Rocket,
  breadth: Layers,
  novel: Lightbulb,
}

/** Ultra 多路小卡：取向图标 + 取向名 + 一行实时摘要；被采用的一路亮起，其余退到背景。 */
function LaneNodeView({ data }: NodeProps<LaneFlowNode>) {
  const { nodeState, direction, onOpen, pick } = data
  const reducedMotion = useReducedMotion()
  const lane = nodeState.node.ultra?.lane ?? 'rigor'
  const Icon = LANE_ICONS[lane]
  const summary = agentSummary(nodeState)
  const usage = nodeState.usage

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reducedMotion ? 0 : 0.32 }}
    >
      <CanvasHandles direction={direction} />
      <button
        type="button"
        aria-label={`多路：${nodeState.node.title}，${nodeStatusLabel[nodeState.status]}${pick === 'picked' ? '，已采用' : ''}`}
        onClick={() => onOpen(nodeState.node.id)}
        data-status={nodeState.status}
        data-pick={pick}
        data-lane={lane}
        style={{ '--node-accent': 'var(--ultra)' } as React.CSSProperties}
        className="canvas-agent-card ultra-lane nodrag nopan relative flex h-[60px] w-[184px] flex-col justify-center gap-1 overflow-hidden rounded-[12px] border border-border px-2.5 text-left shadow-md shadow-black/30 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span aria-hidden className="canvas-card-accent absolute inset-x-0 top-0 h-[2px]" />
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="canvas-avatar-ring keep-round relative flex size-7 shrink-0 items-center justify-center rounded-full">
            <span className="absolute inset-0 rounded-full bg-ultra/80" />
            <Icon className="relative size-3.5 text-white" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-5 text-text-primary">
            {LANE_LABELS[lane]}
          </span>
          {pick === 'picked' ? (
            <span className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded border border-ultra/45 bg-ultra/15 px-1 text-[9px] font-medium text-ultra">
              <Check className="size-2.5" aria-hidden />
              采用
            </span>
          ) : usage !== undefined ? (
            <span className="shrink-0 font-mono text-[9px] text-ink-muted">
              {formatTokens(usage.inputTokens + usage.outputTokens)}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            'flex min-w-0 items-center gap-1 text-[12px] leading-4',
            summary.tone === 'danger' ? 'text-danger' : 'text-text-secondary',
          )}
        >
          <NodeStatusIcon
            status={nodeState.status}
            className={cn('size-3', statusColor(nodeState.status))}
          />
          <span className="truncate">{summary.text}</span>
          {summary.streaming ? <span className="canvas-stream-cursor text-ultra">▍</span> : null}
        </span>
      </button>
    </motion.div>
  )
}

export const LaneNode = memo(LaneNodeView, (previous, next) =>
  sameAgentData(previous.data, next.data),
)

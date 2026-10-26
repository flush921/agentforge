'use client'

import { memo } from 'react'
import { ShieldCheck } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { NodeProps } from '@xyflow/react'
import type { ReviewerFlowNode } from '../types'
import {
  accentStyle,
  AgentStatusLine,
  CanvasHandles,
  NodeBadge,
  nodeStatusLabel,
  sameAgentData,
} from './shared'

function ReviewerNodeView({ data }: NodeProps<ReviewerFlowNode>) {
  const { nodeState, direction, onOpen } = data
  const reducedMotion = useReducedMotion()
  const review = nodeState.review

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reducedMotion ? 0 : 0.32 }}
    >
      <CanvasHandles direction={direction} />
      <button
        type="button"
        aria-label={`环节：${nodeState.node.title}，审校，${nodeStatusLabel[nodeState.status]}`}
        onClick={() => onOpen(nodeState.node.id)}
        data-status={nodeState.status}
        style={accentStyle('review')}
        className="canvas-agent-card nodrag nopan relative flex h-20 w-[184px] flex-col rounded-[14px] border border-border bg-panel px-3 py-2 text-left shadow-lg shadow-black/15 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-10 shrink-0 rotate-45 items-center justify-center border-2 border-role-review bg-background/60">
            <ShieldCheck className="size-4 -rotate-45 text-role-review" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1">
              <span className="truncate text-[14px] font-semibold text-text-primary">
                {nodeState.node.title}
              </span>
              {nodeState.dynamic ? <NodeBadge>复核</NodeBadge> : null}
              {nodeState.attempt > 1 ? (
                <NodeBadge warning>重试 {nodeState.attempt}</NodeBadge>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-[10px]">
              {review?.verdict === 'pass' ? (
                <span className="text-success">✓ 通过</span>
              ) : review?.verdict === 'revise' ? (
                <span className="text-warning">✗ 打回 {review.issues.length} 条</span>
              ) : (
                <span className="text-text-secondary">独立审校</span>
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

export const ReviewerNode = memo(ReviewerNodeView, (previous, next) =>
  sameAgentData(previous.data, next.data),
)

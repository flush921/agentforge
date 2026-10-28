'use client'

import { memo } from 'react'
import { Wrench } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { NodeProps } from '@xyflow/react'
import { formatTokens } from '@/lib/canvas/format'
import { roleInfo } from '@/lib/canvas/format'
import { roleIcons } from '../role-icons'
import type { AgentFlowNode } from '../types'
import {
  accentStyle,
  AgentStatusLine,
  CanvasHandles,
  NodeBadge,
  nodeStatusLabel,
  sameAgentData,
} from './shared'

function AgentNodeView({ data }: NodeProps<AgentFlowNode>) {
  const { nodeState, direction, onOpen } = data
  const reducedMotion = useReducedMotion()
  const info = roleInfo(nodeState.node.role)
  const Icon = roleIcons[nodeState.node.role]
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
        aria-label={`环节：${nodeState.node.title}，${info.label}，${nodeStatusLabel[nodeState.status]}`}
        onClick={() => onOpen(nodeState.node.id)}
        data-status={nodeState.status}
        style={accentStyle(info.family)}
        className="canvas-agent-card nodrag nopan relative flex h-24 w-[216px] flex-col overflow-hidden rounded-[14px] border border-border px-3 py-2 text-left shadow-lg shadow-black/30 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span aria-hidden className="canvas-card-accent absolute inset-x-0 top-0 h-[2px]" />
        <span className="flex min-w-0 items-start gap-2.5">
          <span className="canvas-avatar-ring keep-round relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full">
            <span
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: 'var(--node-accent)' }}
            />
            <Icon className="relative size-4 text-white" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold leading-[18px] text-text-primary">
              {nodeState.node.title}
            </span>
            <span className="block text-[11px] leading-3 text-text-secondary">{info.label}</span>
            <span className="mt-1 flex h-4 items-center gap-1 overflow-hidden">
              {nodeState.attempt > 1 ? (
                <NodeBadge warning>重试 {nodeState.attempt}</NodeBadge>
              ) : null}
              {nodeState.dynamic ? (
                <NodeBadge>{nodeState.revisionOf === undefined ? '降级' : '修订'}</NodeBadge>
              ) : null}
              {nodeState.toolCalls.length > 0 ? (
                <NodeBadge>
                  <Wrench className="size-2.5" aria-hidden />
                  {nodeState.toolCalls.length}
                </NodeBadge>
              ) : null}
              {usage !== undefined ? (
                <NodeBadge>{formatTokens(usage.inputTokens + usage.outputTokens)}</NodeBadge>
              ) : null}
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

export const AgentNode = memo(AgentNodeView, (previous, next) =>
  sameAgentData(previous.data, next.data),
)

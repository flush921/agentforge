'use client'

import type { CSSProperties, ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Check, Clock, Loader2, MinusCircle, XCircle } from 'lucide-react'
import { agentSummary } from '@/lib/canvas/summary'
import type { NodeStatus, NodeState } from '@/lib/run/types'
import { cn } from '@/lib/utils'
import type { AgentNodeData, CanvasDirection } from '../types'

export const nodeStatusLabel: Record<NodeStatus, string> = {
  pending: '等待',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  skipped: '已跳过',
}

export function CanvasHandles({ direction }: { direction: CanvasDirection }) {
  return (
    <>
      <Handle
        type="target"
        position={direction === 'LR' ? Position.Left : Position.Top}
        isConnectable={false}
        className="!opacity-0"
      />
      <Handle
        type="source"
        position={direction === 'LR' ? Position.Right : Position.Bottom}
        isConnectable={false}
        className="!opacity-0"
      />
    </>
  )
}

export function accentStyle(family: 'gather' | 'reason' | 'produce' | 'review'): CSSProperties {
  return { '--node-accent': `var(--role-${family})` } as CSSProperties
}

export function NodeStatusIcon({ status, className }: { status: NodeStatus; className?: string }) {
  const props = { className: cn('size-3.5 shrink-0', className), 'aria-hidden': true }
  if (status === 'running')
    return <Loader2 {...props} className={cn(props.className, 'canvas-spin')} />
  if (status === 'completed') return <Check {...props} />
  if (status === 'failed') return <XCircle {...props} />
  if (status === 'skipped') return <MinusCircle {...props} />
  return <Clock {...props} />
}

export function statusColor(status: NodeStatus): string {
  if (status === 'running') return 'text-brand'
  if (status === 'completed') return 'text-success'
  if (status === 'failed') return 'text-danger'
  return 'text-ink-muted'
}

export function AgentStatusLine({ nodeState }: { nodeState: NodeState }) {
  const summary = agentSummary(nodeState)
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1.5 text-[12px] leading-4',
        summary.tone === 'danger'
          ? 'text-danger'
          : summary.tone === 'muted'
            ? 'text-ink-muted'
            : 'text-text-secondary',
      )}
    >
      <NodeStatusIcon status={nodeState.status} className={statusColor(nodeState.status)} />
      <span className="truncate">{summary.text}</span>
      {summary.streaming ? <span className="canvas-stream-cursor text-brand">▍</span> : null}
    </span>
  )
}

export function NodeBadge({
  children,
  warning = false,
  ultra = false,
}: {
  children: ReactNode
  warning?: boolean
  ultra?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex h-4 shrink-0 items-center gap-0.5 rounded border border-border/80 bg-background/55 px-1 text-[9px] leading-none text-text-secondary',
        warning && 'border-warning/35 bg-warning/10 text-warning',
        ultra && 'border-ultra/40 bg-ultra/10 text-ultra',
      )}
    >
      {children}
    </span>
  )
}

export function sameAgentData(a: AgentNodeData, b: AgentNodeData): boolean {
  return (
    a.graphNode.id === b.graphNode.id &&
    a.graphNode.status === b.graphNode.status &&
    a.nodeState === b.nodeState &&
    a.direction === b.direction &&
    a.pick === b.pick &&
    a.onOpen === b.onOpen
  )
}

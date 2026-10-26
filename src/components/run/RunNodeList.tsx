'use client'

import { Wrench } from 'lucide-react'
import { roleInfo } from '@/lib/canvas/format'
import { agentSummary } from '@/lib/canvas/summary'
import type { RunState } from '@/lib/run/types'
import { cn } from '@/lib/utils'
import { NodeStatusIcon, nodeStatusLabel, statusColor } from '../canvas/nodes/shared'

export function RunNodeList({
  state,
  onOpen,
}: {
  state: RunState
  onOpen: (nodeId: string) => void
}) {
  return (
    <div
      role="region"
      aria-label="编排环节列表"
      className="h-full min-h-[360px] overflow-y-auto rounded-2xl border border-border bg-panel/60 p-2"
    >
      {state.nodeOrder.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink-muted">等待规划生成环节。</p>
      ) : (
        <ol className="space-y-1">
          {state.nodeOrder.map((id, index) => {
            const nodeState = state.nodes[id]
            if (nodeState === undefined) return null
            const summary = agentSummary(nodeState)
            const info = roleInfo(nodeState.node.role)
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onOpen(id)}
                  aria-label={`环节：${nodeState.node.title}，${info.label}，${nodeStatusLabel[nodeState.status]}`}
                  className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:border-border hover:bg-background/55 focus-visible:border-brand focus-visible:outline-none sm:px-4"
                >
                  <span className="w-5 font-mono text-[10px] text-ink-muted">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <NodeStatusIcon
                    status={nodeState.status}
                    className={statusColor(nodeState.status)}
                  />
                  <span className="w-28 shrink-0 sm:w-36">
                    <span className="block truncate text-sm font-medium">
                      {nodeState.node.title}
                    </span>
                    <span className="text-[11px] text-text-secondary">
                      {info.label}
                      {nodeState.dynamic ? ' · 动态' : ''}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-xs',
                      summary.tone === 'danger'
                        ? 'text-danger'
                        : summary.tone === 'muted'
                          ? 'text-ink-muted'
                          : 'text-text-secondary',
                    )}
                  >
                    {summary.text}
                  </span>
                  {nodeState.toolCalls.length > 0 ? (
                    <span className="hidden items-center gap-1 text-[11px] text-text-secondary sm:inline-flex">
                      <Wrench className="size-3" aria-hidden />
                      {nodeState.toolCalls.length}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

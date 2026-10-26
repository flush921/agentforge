'use client'

import { useCallback, useState } from 'react'
import { Bot, Workflow } from 'lucide-react'
import { RunCanvas } from '@/components/canvas/RunCanvas'
import { CanvasViewSwitch, type CanvasView } from '@/components/run/CanvasViewSwitch'
import { NodeDrawer } from '@/components/run/NodeDrawer'
import { RunHeader } from '@/components/run/RunHeader'
import { RunNodeList } from '@/components/run/RunNodeList'
import type { RunState } from '@/lib/run/types'
import type { RunPhase } from '@/stores/run-store'

function EmptyCanvas() {
  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-panel/30 p-8 text-center">
      <div className="flex items-center gap-3" aria-hidden>
        <span className="flex size-12 items-center justify-center rounded-xl border border-dashed border-brand/35 text-brand">
          <Bot className="size-5" />
        </span>
        <span className="h-px w-10 bg-border" />
        <span className="flex size-12 items-center justify-center rounded-xl border border-dashed border-border text-text-secondary">
          <Workflow className="size-5" />
        </span>
        <span className="h-px w-10 bg-border" />
        <span className="flex size-12 items-center justify-center rounded-xl border border-dashed border-border text-text-secondary">
          <Bot className="size-5" />
        </span>
      </div>
      <p className="mt-6 max-w-sm text-sm leading-6 text-text-secondary">
        发送任务后，这里会实时画出 Agent 编排
      </p>
      <p className="mt-2 text-xs text-ink-muted">简单任务一个 Agent，复杂任务多 Agent 协作</p>
    </div>
  )
}

export function OrchestrationPanel({ state, phase }: { state: RunState; phase: RunPhase }) {
  const [view, setView] = useState<CanvasView>('canvas')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const openNode = useCallback((nodeId: string) => setSelectedNode(nodeId), [])
  const closeDrawer = useCallback(() => setSelectedNode(null), [])

  if (state.runId === null) return <EmptyCanvas />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RunHeader state={state} time={state.lastT} />
      <div className="mt-3 flex shrink-0 justify-end">
        <CanvasViewSwitch view={view} onChange={setView} />
      </div>
      <div className="mt-3 min-h-0 flex-1">
        {view === 'canvas' ? (
          <RunCanvas
            key={`${state.runId}-${phase === 'awaiting_confirm' ? 'confirm' : 'execute'}`}
            state={state}
            onOpen={openNode}
            initialCamera={phase === 'awaiting_confirm' ? 'overview' : 'follow'}
          />
        ) : (
          <RunNodeList state={state} onOpen={openNode} />
        )}
      </div>
      <NodeDrawer state={state} nodeId={selectedNode} onClose={closeDrawer} />
    </div>
  )
}

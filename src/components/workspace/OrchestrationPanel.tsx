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
    <div className="canvas-stage relative flex h-full min-h-[360px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] p-8 text-center">
      <div aria-hidden className="relative flex size-56 items-center justify-center">
        <span className="radar-ring absolute inset-0 rounded-full border border-brand/15" />
        <span className="radar-ring absolute inset-7 rounded-full border border-brand/20 [animation-delay:-1s]" />
        <span className="radar-ring absolute inset-14 rounded-full border border-brand/25 [animation-delay:-2s]" />
        <span className="radar-sweep absolute inset-0 rounded-full" />
        <span className="orbit absolute inset-0">
          <span className="absolute left-1/2 top-0 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-role-gather/60 bg-panel text-role-gather shadow-[0_0_18px_-4px_var(--role-gather)]">
            <Bot className="size-4" />
          </span>
          <span className="absolute bottom-[12%] left-[6%] flex size-9 items-center justify-center rounded-full border border-role-reason/60 bg-panel text-role-reason shadow-[0_0_18px_-4px_var(--role-reason)]">
            <Bot className="size-4" />
          </span>
          <span className="absolute bottom-[12%] right-[6%] flex size-9 items-center justify-center rounded-full border border-role-produce/60 bg-panel text-role-produce shadow-[0_0_18px_-4px_var(--role-produce)]">
            <Bot className="size-4" />
          </span>
        </span>
        <span className="relative flex size-14 items-center justify-center rounded-2xl border border-brand/50 bg-brand/10 text-brand shadow-[0_0_32px_-6px_var(--brand)]">
          <Workflow className="size-6" />
        </span>
      </div>
      <p className="mt-8 max-w-sm text-sm leading-6 text-text-secondary">
        {'发送任务后，这里会实时画出子 Agent 编排'}
      </p>
      <p className="mt-2 text-xs text-ink-muted">
        {'简单任务一个子 Agent，复杂任务多子 Agent 协作'}
      </p>
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

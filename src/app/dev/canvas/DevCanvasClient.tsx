'use client'

import { useCallback, useState } from 'react'
import { Workflow } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RunCanvas, type CameraMode } from '@/components/canvas/RunCanvas'
import { NodeDrawer } from '@/components/run/NodeDrawer'
import { ReplayControls } from '@/components/run/ReplayControls'
import { RunHeader } from '@/components/run/RunHeader'
import { RunNodeList } from '@/components/run/RunNodeList'
import { sampleRunL0, sampleRunL4 } from '@/lib/fixtures/runs'
import { useReplay } from '@/hooks/use-replay'

export type CanvasSample = 'l0' | 'l4'

export function DevCanvasClient({
  initialSample,
  initialT,
  autoplay,
  initialCamera,
}: {
  initialSample: CanvasSample
  initialT: number
  autoplay: boolean
  initialCamera: CameraMode
}) {
  const [sample, setSample] = useState(initialSample)
  const [view, setView] = useState<'canvas' | 'list'>('canvas')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const events = sample === 'l4' ? sampleRunL4 : sampleRunL0
  const replay = useReplay(events, { initialT, autoplay })
  const openNode = useCallback((nodeId: string) => setSelectedNode(nodeId), [])
  const closeDrawer = useCallback(() => setSelectedNode(null), [])

  return (
    <TooltipProvider>
      <main className="flex h-dvh min-h-[640px] flex-col overflow-hidden bg-background text-text-primary">
        <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-3 p-3 sm:p-4">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl border border-brand/30 bg-brand/10 text-brand">
                <Workflow className="size-5" aria-hidden />
              </span>
              <div>
                <div className="flex items-baseline gap-2">
                  <h1 className="text-lg font-semibold tracking-tight">AgentForge</h1>
                  <span className="text-[10px] tracking-[0.18em] text-ink-muted">
                    ORCHESTRATION ATLAS
                  </span>
                </div>
                <p className="text-[11px] text-text-secondary">
                  编排星图 · 看见 Agent 如何协作与自我修正
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full border border-border bg-panel px-2.5 py-1 text-[10px] text-text-secondary sm:inline">
                离线夹具 · 不消耗 token
              </span>
              <label className="text-[11px] text-text-secondary" htmlFor="canvas-sample">
                示例
              </label>
              <select
                id="canvas-sample"
                value={sample}
                onChange={(event) => {
                  setSample(event.target.value as CanvasSample)
                  setSelectedNode(null)
                }}
                className="h-8 rounded-lg border border-border bg-panel px-2 text-xs text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <option value="l4">L4 · 审校返工</option>
                <option value="l0">L0 · 简单直答</option>
              </select>
            </div>
          </header>

          <ReplayControls replay={replay} view={view} onViewChange={setView} />

          <RunHeader state={replay.state} time={replay.t} />
          <div className="min-h-0 flex-1">
            {view === 'canvas' ? (
              <RunCanvas
                state={replay.state}
                onOpen={openNode}
                instantFit={!autoplay}
                initialCamera={initialCamera}
              />
            ) : (
              <RunNodeList state={replay.state} onOpen={openNode} />
            )}
          </div>
        </div>
        <NodeDrawer state={replay.state} nodeId={selectedNode} onClose={closeDrawer} />
      </main>
    </TooltipProvider>
  )
}

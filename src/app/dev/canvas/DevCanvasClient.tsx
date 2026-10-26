'use client'

import { useCallback, useState } from 'react'
import { List, Pause, Play, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { RunCanvas, type CameraMode } from '@/components/canvas/RunCanvas'
import { NodeDrawer } from '@/components/run/NodeDrawer'
import { RunHeader } from '@/components/run/RunHeader'
import { RunNodeList } from '@/components/run/RunNodeList'
import { formatDuration } from '@/lib/canvas/format'
import { sampleRunL0, sampleRunL4 } from '@/lib/fixtures/runs'
import { useReplay } from '@/hooks/use-replay'
import { cn } from '@/lib/utils'

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

          <section
            aria-label="回放控制"
            className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-panel/70 px-2.5 py-2"
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={replay.playing ? '暂停回放' : '播放回放'}
                  />
                }
                onClick={replay.playing ? replay.pause : replay.play}
              >
                {replay.playing ? <Pause aria-hidden /> : <Play aria-hidden />}
              </TooltipTrigger>
              <TooltipContent>{replay.playing ? '暂停回放' : '播放回放'}</TooltipContent>
            </Tooltip>
            <div
              className="flex rounded-lg border border-border bg-background/45 p-0.5"
              aria-label="回放速度"
            >
              {([1, 2, 4] as const).map((speed) => (
                <button
                  key={speed}
                  type="button"
                  aria-pressed={replay.speed === speed}
                  onClick={() => replay.setSpeed(speed)}
                  className={cn(
                    'h-6 min-w-8 rounded-md px-1.5 font-mono text-[10px] text-text-secondary outline-none hover:bg-muted focus-visible:ring-1 focus-visible:ring-brand',
                    replay.speed === speed && 'bg-secondary text-brand',
                  )}
                >
                  {speed}×
                </button>
              ))}
            </div>
            <input
              type="range"
              aria-label="回放时间"
              min={0}
              max={Math.max(replay.duration, 1)}
              step={10}
              value={replay.t}
              onChange={(event) => replay.seek(Number(event.target.value))}
              className="mx-1 h-1.5 min-w-[140px] flex-1 cursor-pointer accent-brand"
            />
            <span className="w-[92px] text-right font-mono text-[10px] text-text-secondary">
              {formatDuration(replay.t)} / {formatDuration(replay.duration)}
            </span>
            <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
            <div
              className="flex rounded-lg border border-border bg-background/45 p-0.5"
              aria-label="视图切换"
            >
              <button
                type="button"
                aria-pressed={view === 'canvas'}
                onClick={() => setView('canvas')}
                className={cn(
                  'flex h-6 items-center gap-1 rounded-md px-2 text-[10px] text-text-secondary outline-none hover:bg-muted focus-visible:ring-1 focus-visible:ring-brand',
                  view === 'canvas' && 'bg-secondary text-brand',
                )}
              >
                <Workflow className="size-3" aria-hidden />
                画布
              </button>
              <button
                type="button"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
                className={cn(
                  'flex h-6 items-center gap-1 rounded-md px-2 text-[10px] text-text-secondary outline-none hover:bg-muted focus-visible:ring-1 focus-visible:ring-brand',
                  view === 'list' && 'bg-secondary text-brand',
                )}
              >
                <List className="size-3" aria-hidden />
                列表
              </button>
            </div>
          </section>

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

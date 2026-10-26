'use client'

import { Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CanvasViewSwitch, type CanvasView } from '@/components/run/CanvasViewSwitch'
import type { UseReplayResult } from '@/hooks/use-replay'
import { formatDuration } from '@/lib/canvas/format'
import { cn } from '@/lib/utils'

export function ReplayControls({
  replay,
  view,
  onViewChange,
}: {
  replay: UseReplayResult
  view: CanvasView
  onViewChange: (view: CanvasView) => void
}) {
  return (
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
      <CanvasViewSwitch view={view} onChange={onViewChange} />
    </section>
  )
}

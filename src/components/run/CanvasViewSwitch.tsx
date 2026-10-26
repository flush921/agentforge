'use client'

import { List, Workflow } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CanvasView = 'canvas' | 'list'

export function CanvasViewSwitch({
  view,
  onChange,
}: {
  view: CanvasView
  onChange: (view: CanvasView) => void
}) {
  return (
    <div
      className="flex rounded-lg border border-border bg-background/45 p-0.5"
      aria-label="视图切换"
    >
      <button
        type="button"
        aria-pressed={view === 'canvas'}
        onClick={() => onChange('canvas')}
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
        onClick={() => onChange('list')}
        className={cn(
          'flex h-6 items-center gap-1 rounded-md px-2 text-[10px] text-text-secondary outline-none hover:bg-muted focus-visible:ring-1 focus-visible:ring-brand',
          view === 'list' && 'bg-secondary text-brand',
        )}
      >
        <List className="size-3" aria-hidden />
        列表
      </button>
    </div>
  )
}

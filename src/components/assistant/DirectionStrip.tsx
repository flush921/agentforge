import type { Direction } from '@/lib/contracts/common'
import { directionSchema } from '@/lib/contracts/common'
import { DIRECTION_LABELS } from '@/lib/assistant/labels'
import { cn } from '@/lib/utils'

export function DirectionStrip({ directions }: { directions: Direction[] }) {
  const covered = new Set(directions)

  return (
    <section aria-label="助手覆盖方向">
      <p className="text-[11px] tracking-wide text-text-secondary">同一引擎 · 覆盖赛道十大方向</p>
      <ol className="mt-3 flex flex-wrap gap-1.5">
        {directionSchema.options.map((direction) => {
          const selected = covered.has(direction)
          return (
            <li
              key={direction}
              data-covered={selected}
              title={selected ? '已覆盖' : '暂未覆盖'}
              className={cn(
                'rounded-md border px-2 py-1 text-[11px] leading-4',
                selected
                  ? 'border-brand/60 bg-brand/10 text-brand'
                  : 'border-border/60 bg-background/30 text-ink-muted',
              )}
            >
              {DIRECTION_LABELS[direction]}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

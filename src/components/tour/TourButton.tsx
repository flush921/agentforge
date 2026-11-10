'use client'

import { CircleHelp } from 'lucide-react'
import { useTourStore } from '@/stores/tour-store'
import { cn } from '@/lib/utils'

/** 常驻的「新手教程」入口：随时从头再看一遍。 */
export function TourButton({ className }: { className?: string }) {
  const start = useTourStore((store) => store.start)

  return (
    <button
      type="button"
      onClick={start}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-text-secondary transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
    >
      <CircleHelp className="size-3.5" aria-hidden />
      新手教程
    </button>
  )
}

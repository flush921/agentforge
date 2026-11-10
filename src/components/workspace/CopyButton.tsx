'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { copyText } from '@/lib/client/copy'
import { cn } from '@/lib/utils'

/** 复制按钮：点击后短暂显示「已复制」，让用户确认操作生效了。 */
export function CopyButton({ text, label = '复制答案' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    const ok = await copyText(text)
    setState(ok ? 'copied' : 'failed')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 1800)
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-live="polite"
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-background/50 px-2.5 text-[11px] text-text-secondary transition-colors hover:border-brand/45 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        state === 'copied' && 'border-success/40 text-success hover:text-success',
        state === 'failed' && 'border-warning/40 text-warning hover:text-warning',
      )}
    >
      {state === 'copied' ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {state === 'copied' ? '已复制' : state === 'failed' ? '复制失败，请手动选择' : label}
    </button>
  )
}

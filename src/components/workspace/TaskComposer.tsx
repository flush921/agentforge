'use client'

import { SendHorizontal, Square, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { handleEnterKey } from '@/lib/client/enter-key'
import { cn } from '@/lib/utils'
import { IntensityDial } from './IntensityDial'

export function TaskComposer({
  task,
  onTaskChange,
  intensity,
  onIntensityChange,
  confirmBeforeRun,
  onConfirmBeforeRunChange,
  ultra,
  onUltraChange,
  running,
  onSend,
  onStop,
}: {
  task: string
  onTaskChange: (task: string) => void
  intensity: number
  onIntensityChange: (value: number) => void
  confirmBeforeRun: boolean
  onConfirmBeforeRunChange: (checked: boolean) => void
  ultra: boolean
  onUltraChange: (checked: boolean) => void
  running: boolean
  onSend: () => void
  onStop: () => void
}) {
  const empty = task.trim().length === 0

  function send() {
    if (!empty && !running) onSend()
  }

  return (
    <form
      aria-label="任务输入"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
      className="shrink-0 border-t border-white/[0.06] bg-background/40 p-3"
    >
      <label htmlFor="workspace-task" className="sr-only">
        输入要交给 Agent 的任务
      </label>
      <Textarea
        id="workspace-task"
        value={task}
        onChange={(event) => onTaskChange(event.target.value)}
        onKeyDown={(event) => handleEnterKey(event, send, onTaskChange)}
        maxLength={4000}
        rows={3}
        disabled={running}
        placeholder="输入一个任务，看看它会如何编排…"
        aria-describedby="workspace-task-count"
        className="max-h-40 min-h-20 resize-y border-white/10 bg-background/70 text-sm leading-6 transition-shadow focus-visible:shadow-[0_0_0_1px_var(--brand),0_0_24px_-6px_var(--brand)]"
      />
      <div id="workspace-task-count" className="mt-1 text-right text-[10px] text-ink-muted">
        {task.length}/4000
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {ultra ? (
          <p className="min-w-40 flex-1 text-[11px] leading-5 text-text-secondary">
            <span className="ultra-text font-semibold">Ultra · 超编排</span>
            {' · 终极多路：每个环节多路并行，择优后再经两层审阅'}
          </p>
        ) : (
          <IntensityDial value={intensity} onChange={onIntensityChange} disabled={running} />
        )}
        <button
          type="button"
          role="switch"
          aria-checked={ultra}
          aria-label="Ultra 模式"
          disabled={running}
          onClick={() => onUltraChange(!ultra)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-border bg-background/50 px-3 py-1.5 text-xs font-semibold text-text-secondary transition-all hover:border-ultra/45 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ultra disabled:opacity-50',
            ultra && 'ultra-switch-on text-text-primary',
          )}
        >
          <Zap className={cn('size-3.5', ultra && 'fill-current text-ultra')} aria-hidden />
          <span className={ultra ? 'ultra-text' : undefined}>Ultra</span>
        </button>
        <div className="flex items-center gap-2">
          <Switch
            id="confirm-before-run"
            aria-label="执行前确认"
            checked={confirmBeforeRun}
            disabled={running}
            onCheckedChange={onConfirmBeforeRunChange}
          />
          <div>
            <label htmlFor="confirm-before-run" className="text-xs text-text-primary">
              执行前确认
            </label>
            <p className="text-[10px] text-ink-muted">子 Agent 编排先给你过目</p>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[10px] text-ink-muted">Enter 发送 · Ctrl / ⌘ + Enter 换行</span>
        {running ? (
          <Button type="button" variant="destructive" size="sm" onClick={onStop}>
            <Square aria-hidden />
            停止
          </Button>
        ) : (
          <Button type="submit" size="sm" disabled={empty} className="glow-button px-3.5">
            <SendHorizontal aria-hidden />
            发送
          </Button>
        )}
      </div>
    </form>
  )
}

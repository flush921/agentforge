'use client'

import { SendHorizontal, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { IntensityDial } from './IntensityDial'

export function TaskComposer({
  task,
  onTaskChange,
  intensity,
  onIntensityChange,
  confirmBeforeRun,
  onConfirmBeforeRunChange,
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
      className="shrink-0 border-t border-border bg-panel p-3"
    >
      <label htmlFor="workspace-task" className="sr-only">
        输入要交给助手的任务
      </label>
      <Textarea
        id="workspace-task"
        value={task}
        onChange={(event) => onTaskChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key === 'Enter' &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault()
            send()
          }
        }}
        maxLength={4000}
        rows={3}
        disabled={running}
        placeholder="输入一个任务，看看它会如何编排…"
        aria-describedby="workspace-task-count"
        className="max-h-40 min-h-20 resize-y bg-background/60 text-sm leading-6"
      />
      <div id="workspace-task-count" className="mt-1 text-right text-[10px] text-ink-muted">
        {task.length}/4000
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <IntensityDial value={intensity} onChange={onIntensityChange} disabled={running} />
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
            <p className="text-[10px] text-ink-muted">多 Agent 编排先给你过目</p>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[10px] text-ink-muted">Ctrl / ⌘ + Enter</span>
        {running ? (
          <Button type="button" variant="destructive" size="sm" onClick={onStop}>
            <Square aria-hidden />
            停止
          </Button>
        ) : (
          <Button type="submit" size="sm" disabled={empty}>
            <SendHorizontal aria-hidden />
            发送
          </Button>
        )}
      </div>
    </form>
  )
}

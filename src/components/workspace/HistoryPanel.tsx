'use client'

import { memo, useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock3, Loader2, MinusCircle, Trash2, XCircle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTokens } from '@/lib/canvas/format'
import type { RunRecord, RunStatus } from '@/lib/contracts/run-record'
import { deleteRun, listRuns } from '@/lib/storage/runs'

const statusInfo: Record<RunStatus, { label: string; icon: typeof Clock3; className: string }> = {
  idle: { label: '待开始', icon: Clock3, className: 'text-ink-muted' },
  assessing: { label: '评估中', icon: Loader2, className: 'text-brand' },
  planning: { label: '规划中', icon: Loader2, className: 'text-brand' },
  running: { label: '执行中', icon: Loader2, className: 'text-brand' },
  completed: { label: '已完成', icon: CheckCircle2, className: 'text-success' },
  failed: { label: '失败', icon: XCircle, className: 'text-danger' },
  cancelled: { label: '已取消', icon: MinusCircle, className: 'text-ink-muted' },
}

const timeUnits: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
]

function relativeTime(createdAt: string): string {
  const difference = Date.parse(createdAt) - Date.now()
  const absolute = Math.abs(difference)
  if (absolute < 60_000) return '刚刚'
  const unit = timeUnits.find((candidate) => absolute >= candidate.ms) ?? timeUnits.at(-1)!
  return new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' }).format(
    Math.round(difference / unit.ms),
    unit.unit,
  )
}

function agentCount(record: RunRecord): number {
  return new Set(
    record.events.flatMap((event) => (event.type === 'node.started' ? [event.nodeId] : [])),
  ).size
}

export const HistoryPanel = memo(function HistoryPanel({
  assistantId,
  open,
  onOpenChange,
  onCountChange,
}: {
  assistantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCountChange: (count: number) => void
}) {
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RunRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    listRuns({ assistantId, limit: 30 })
      .then((records) => {
        if (!active) return
        setRuns(records)
        onCountChange(records.length)
      })
      .catch(() => {
        if (active) setError('无法读取运行记录')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [assistantId, onCountChange])

  async function remove(runId: string) {
    setDeletingId(runId)
    setError(null)
    try {
      await deleteRun(runId)
      const remaining = runs.filter((run) => run.runId !== runId)
      setRuns(remaining)
      onCountChange(remaining.length)
    } catch {
      setError('删除失败，请重试')
    } finally {
      setDeletingId((current) => (current === runId ? null : current))
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full gap-0 overflow-y-auto border-border bg-panel p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border p-5">
            <SheetTitle>历史运行</SheetTitle>
            <SheetDescription>最近 30 条记录，点击可回放完整编排过程</SheetDescription>
          </SheetHeader>
          <div className="space-y-2 p-3">
            {loading ? (
              <>
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </>
            ) : error !== null && runs.length === 0 ? (
              <p role="alert" className="p-6 text-center text-sm text-danger">
                {error}
              </p>
            ) : runs.length === 0 ? (
              <p className="p-8 text-center text-sm text-text-secondary">还没有运行记录</p>
            ) : (
              runs.map((run) => {
                const status = statusInfo[run.status]
                const StatusIcon = status.icon
                return (
                  <article
                    key={run.runId}
                    data-run-id={run.runId}
                    data-level={run.level}
                    className="flex items-start gap-1 rounded-xl border border-border bg-background/35 p-1.5"
                  >
                    <Link
                      href={`/a/${encodeURIComponent(assistantId)}/runs/${encodeURIComponent(run.runId)}`}
                      onClick={() => onOpenChange(false)}
                      className="min-w-0 flex-1 rounded-lg p-2.5 outline-none hover:bg-secondary/45 focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <span className="block truncate text-sm font-medium text-text-primary">
                        {run.task.slice(0, 30)}
                        {run.task.length > 30 ? '…' : ''}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-text-secondary">
                        {run.level !== undefined ? (
                          <span className="rounded border border-brand/25 px-1 font-mono text-brand">
                            L{run.level}
                          </span>
                        ) : null}
                        <span>Agent ×{agentCount(run)}</span>
                        <span className={status.className}>
                          <StatusIcon className="mr-1 inline size-3" aria-hidden />
                          {status.label}
                        </span>
                      </span>
                      <span className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-ink-muted">
                        <span>{relativeTime(run.createdAt)}</span>
                        <span>
                          {formatTokens(run.usage.inputTokens + run.usage.outputTokens)} token
                        </span>
                      </span>
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={deletingId !== null}
                      aria-label={`删除运行记录 ${run.task.slice(0, 30)}`}
                      className="mt-1 shrink-0 text-ink-muted hover:text-danger"
                      onClick={() => setDeleteTarget(run)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </article>
                )
              })
            )}
            {error !== null && runs.length > 0 ? (
              <p role="alert" className="p-2 text-xs text-danger">
                {error}
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条运行记录？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除「{deleteTarget?.task.slice(0, 30)}」及其回放事件，删除后无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              onClick={() => {
                const target = deleteTarget
                setDeleteTarget(null)
                if (target !== null) void remove(target.runId)
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})

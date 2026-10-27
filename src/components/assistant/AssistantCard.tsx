'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DIRECTION_LABELS } from '@/lib/assistant/labels'
import type { AssistantSpec } from '@/lib/contracts/assistant'
import { cn } from '@/lib/utils'

export function AssistantCard({
  assistant,
  preset = false,
  deleting = false,
  onDelete,
}: {
  assistant: AssistantSpec
  preset?: boolean
  deleting?: boolean
  onDelete?: (id: string) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const canDelete = !preset && onDelete !== undefined

  return (
    <article
      data-assistant-id={assistant.id}
      data-preset={preset || undefined}
      aria-busy={deleting}
      className={cn('relative h-full', deleting && 'opacity-60')}
    >
      <Link
        href={`/a/${encodeURIComponent(assistant.id)}`}
        aria-label={`打开 Agent ${assistant.name}`}
        className="spotlight glass-panel group block h-full min-h-44 rounded-2xl p-4 transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <div className={cn('flex items-center gap-3', preset ? 'pr-12' : 'pr-7')}>
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-2xl transition-shadow duration-300"
            style={{
              backgroundColor: assistant.color,
              boxShadow: `0 0 22px -6px ${assistant.color}`,
            }}
          >
            {assistant.avatar}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-text-primary">{assistant.name}</h3>
            <p className="mt-1 text-[11px] text-ink-muted">{assistant.domain}</p>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-text-secondary">
          {assistant.tagline}
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {assistant.directions.slice(0, 3).map((direction) => (
            <span
              key={direction}
              className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-text-secondary"
            >
              {DIRECTION_LABELS[direction]}
            </span>
          ))}
        </div>
      </Link>
      {preset ? (
        <span className="pointer-events-none absolute right-3 top-3 rounded-full border border-brand/25 bg-brand/10 px-2 py-0.5 text-[10px] text-brand">
          示例
        </span>
      ) : null}
      {canDelete ? (
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={deleting}
                aria-label={`删除 Agent ${assistant.name}`}
                className="absolute right-2 top-2 text-ink-muted hover:text-danger"
              />
            }
          >
            <Trash2 className="size-3.5" aria-hidden />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除「{assistant.name}」？</AlertDialogTitle>
              <AlertDialogDescription>
                {'删除后该 Agent 的运行记录也会一并删除，且无法恢复。'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => {
                  setConfirming(false)
                  onDelete(assistant.id)
                }}
              >
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </article>
  )
}

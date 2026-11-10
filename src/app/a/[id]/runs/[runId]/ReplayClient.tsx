'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ReplayPlayer } from '@/components/run/ReplayPlayer'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { findAssistant } from '@/lib/client/find-assistant'
import type { AssistantSpec } from '@/lib/contracts/assistant'
import type { RunRecord } from '@/lib/contracts/run-record'
import { getRun } from '@/lib/storage/runs'

export function ReplayClient({ assistantId, runId }: { assistantId: string; runId: string }) {
  const [record, setRecord] = useState<RunRecord | null>(null)
  const [assistant, setAssistant] = useState<AssistantSpec | undefined>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([getRun(runId), findAssistant(assistantId)])
      .then(([run, foundAssistant]) => {
        if (!active) return
        setRecord(run?.assistantId === assistantId ? run : null)
        setAssistant(foundAssistant)
      })
      .catch(() => {
        if (active) setRecord(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [assistantId, runId])

  if (loading) {
    return (
      <main className="min-h-screen bg-background p-6 text-text-primary">
        <div role="status" aria-live="polite" className="mx-auto max-w-3xl space-y-4 pt-16">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-64 w-full" />
          <p className="text-sm text-text-secondary">正在读取回放记录…</p>
        </div>
      </main>
    )
  }

  if (record === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center text-text-primary">
        <h1 className="text-2xl font-semibold">记录不存在</h1>
        <p className="mt-2 text-sm text-text-secondary">它可能已被删除，或链接不正确。</p>
        <Button className="mt-6" render={<Link href={`/a/${encodeURIComponent(assistantId)}`} />}>
          返回工作台
        </Button>
      </main>
    )
  }

  return (
    <ReplayPlayer
      key={record.runId}
      events={record.events}
      task={record.task}
      title={`${assistant?.name ?? 'Agent'} · 运行回放`}
      backHref={`/a/${encodeURIComponent(record.assistantId)}`}
      backLabel="返回工作台"
    />
  )
}

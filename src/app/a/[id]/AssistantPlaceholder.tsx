'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CircleHelp, Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { findAssistant } from '@/lib/client/find-assistant'
import type { AssistantSpec } from '@/lib/contracts/assistant'

export function AssistantPlaceholder({ id }: { id: string }) {
  const [assistant, setAssistant] = useState<AssistantSpec | undefined>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    findAssistant(id)
      .then((record) => {
        if (active) setAssistant(record)
      })
      .catch(() => {
        if (active) setAssistant(undefined)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-border bg-panel p-6"
      >
        <div aria-hidden className="space-y-4">
          <Skeleton className="size-14 rounded-full" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <p className="mt-5 text-sm text-text-secondary">正在读取助手配置…</p>
      </div>
    )
  }

  if (assistant === undefined) {
    return (
      <section className="rounded-2xl border border-border bg-panel p-8 text-center">
        <CircleHelp className="mx-auto size-10 text-ink-muted" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">助手不存在</h1>
        <p className="mt-2 text-sm text-text-secondary">它可能已被删除，或链接不正确。</p>
        <Button className="mt-6" render={<Link href="/" />}>
          返回首页
        </Button>
      </section>
    )
  }

  return (
    <article className="rounded-2xl border border-border bg-panel p-5 sm:p-7">
      <header className="flex items-center gap-4">
        <span
          aria-hidden
          className="flex size-16 shrink-0 items-center justify-center rounded-full text-3xl"
          style={{ backgroundColor: assistant.color }}
        >
          {assistant.avatar}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{assistant.name}</h1>
            <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] text-brand">
              {assistant.domain}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-6 text-text-secondary">{assistant.tagline}</p>
        </div>
      </header>

      <p className="mt-6 flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/10 p-3 text-sm text-brand">
        <Clock3 className="size-4 shrink-0" aria-hidden />
        工作台即将上线
      </p>

      <section className="mt-6" aria-label="开场示例">
        <h2 className="text-sm font-medium">可以试试这些任务</h2>
        <ol className="mt-3 space-y-2">
          {assistant.starters.map((starter, index) => (
            <li
              key={`${index}-${starter}`}
              className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3 text-sm leading-6 text-text-secondary"
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] text-brand">
                {index + 1}
              </span>
              {starter}
            </li>
          ))}
        </ol>
      </section>
      <Button className="mt-6" variant="outline" render={<Link href="/" />}>
        返回首页
      </Button>
    </article>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { ReplayPlayer } from '@/components/run/ReplayPlayer'
import { TourButton } from '@/components/tour/TourButton'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DEMO_RUN_URL,
  DEMO_SPEED,
  demoNote,
  FALLBACK_DEMO_RUN,
  parseDemoRun,
  type DemoRun,
} from '@/lib/tour/demo-run'
import { TOUR_ASSISTANT_ID } from '@/lib/tour/steps'

export function DemoClient() {
  const [run, setRun] = useState<DemoRun | null>(null)

  useEffect(() => {
    let active = true
    fetch(DEMO_RUN_URL)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((value: unknown) => {
        if (active) setRun(parseDemoRun(value) ?? FALLBACK_DEMO_RUN)
      })
      .catch(() => {
        // 录像取不到时退回示例数据，页面会如实标成「示例数据」。
        if (active) setRun(FALLBACK_DEMO_RUN)
      })
    return () => {
      active = false
    }
  }, [])

  if (run === null) {
    return (
      <main className="min-h-screen p-6 text-text-primary">
        <div role="status" aria-live="polite" className="mx-auto max-w-3xl space-y-4 pt-16">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-64 w-full" />
          <p className="text-sm text-text-secondary">正在读取演示回放…</p>
        </div>
      </main>
    )
  }

  return (
    <ReplayPlayer
      events={run.events}
      task={run.task}
      title="复杂任务 · 演示回放"
      backHref={`/a/${TOUR_ASSISTANT_ID}`}
      backLabel="返回工作台"
      // 示例数据只有 40 秒，2 倍速即可；真实录像约 3 分钟，用更高的倍速。
      initialSpeed={run.recorded ? DEMO_SPEED : 2}
      demoNote={demoNote(run)}
      headerExtra={<TourButton />}
    />
  )
}

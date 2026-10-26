'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { RunCanvas } from '@/components/canvas/RunCanvas'
import { Markdown } from '@/components/markdown/Markdown'
import { NodeDrawer } from '@/components/run/NodeDrawer'
import { ReplayControls } from '@/components/run/ReplayControls'
import { RunHeader } from '@/components/run/RunHeader'
import { RunNodeList } from '@/components/run/RunNodeList'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipProvider } from '@/components/ui/tooltip'
import { findAssistant } from '@/lib/client/find-assistant'
import type { AssistantSpec } from '@/lib/contracts/assistant'
import type { RunRecord } from '@/lib/contracts/run-record'
import { getRun } from '@/lib/storage/runs'
import { useReplay } from '@/hooks/use-replay'
import type { CanvasView } from '@/components/run/CanvasViewSwitch'

function ReplayPlayer({ record, assistant }: { record: RunRecord; assistant?: AssistantSpec }) {
  const replay = useReplay(record.events, { autoplay: true })
  const [view, setView] = useState<CanvasView>('canvas')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const openNode = useCallback((nodeId: string) => setSelectedNode(nodeId), [])
  const closeDrawer = useCallback(() => setSelectedNode(null), [])
  const outputNode =
    replay.state.outputNodeId === undefined
      ? undefined
      : replay.state.nodes[replay.state.outputNodeId]
  const answer =
    replay.state.output ?? (outputNode?.status === 'running' ? outputNode.text : undefined)

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <Link
          href={`/a/${encodeURIComponent(record.assistantId)}`}
          className="flex items-center gap-1.5 rounded-lg text-xs text-text-secondary hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ArrowLeft className="size-4" aria-hidden />
          返回工作台
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{assistant?.name ?? '助手'} · 运行回放</h1>
          <p className="mt-0.5 text-[11px] text-brand">回放 · 不消耗 token</p>
        </div>
      </header>
      <TooltipProvider>
        <main className="mx-auto max-w-[1800px] space-y-3 p-3 sm:p-4">
          <ReplayControls replay={replay} view={view} onViewChange={setView} />
          <div className="grid gap-4 xl:grid-cols-[minmax(320px,2fr)_minmax(0,3fr)]">
            <section className="min-w-0 rounded-2xl border border-border bg-panel p-4">
              <h2 className="text-[11px] font-medium text-ink-muted">任务</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">
                {record.task}
              </p>
              <div className="mt-5 border-t border-border pt-4">
                <h2 className="text-sm font-semibold">最终答案</h2>
                <div className="mt-3">
                  {answer !== undefined && answer.length > 0 ? (
                    <Markdown>{answer}</Markdown>
                  ) : (
                    <p className="text-sm text-text-secondary">等待最终节点产出…</p>
                  )}
                  {replay.state.degraded ? (
                    <p className="mt-3 text-xs text-warning">本次为降级交付</p>
                  ) : null}
                </div>
              </div>
            </section>
            <section className="flex min-h-[560px] min-w-0 flex-col lg:h-[calc(100dvh-220px)]">
              <RunHeader state={replay.state} time={replay.t} />
              <div className="mt-3 min-h-0 flex-1">
                {view === 'canvas' ? (
                  <RunCanvas state={replay.state} onOpen={openNode} />
                ) : (
                  <RunNodeList state={replay.state} onOpen={openNode} />
                )}
              </div>
            </section>
          </div>
        </main>
      </TooltipProvider>
      <NodeDrawer state={replay.state} nodeId={selectedNode} onClose={closeDrawer} />
    </div>
  )
}

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

  return <ReplayPlayer key={record.runId} record={record} assistant={assistant} />
}

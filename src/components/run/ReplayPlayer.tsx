'use client'

import { useCallback, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { RunCanvas } from '@/components/canvas/RunCanvas'
import { Markdown } from '@/components/markdown/Markdown'
import type { CanvasView } from '@/components/run/CanvasViewSwitch'
import { NodeDrawer } from '@/components/run/NodeDrawer'
import { ReplayControls } from '@/components/run/ReplayControls'
import { RunHeader } from '@/components/run/RunHeader'
import { RunNodeList } from '@/components/run/RunNodeList'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useReplay } from '@/hooks/use-replay'
import type { RunEvent } from '@/lib/contracts/events'

/**
 * 回放一段运行事件：左边是任务和最终答案，右边是画布。
 * 历史记录的回放和新手教程的演示回放共用这个组件；
 * 传入 demoNote 时进入演示模式：顶部出现醒目的说明条，画布上盖一个「演示回放」角标。
 */
export function ReplayPlayer({
  events,
  task,
  title,
  backHref,
  backLabel,
  initialSpeed,
  demoNote,
  headerExtra,
}: {
  events: readonly RunEvent[]
  task: string
  title: string
  backHref: string
  backLabel: string
  initialSpeed?: number
  demoNote?: string
  headerExtra?: ReactNode
}) {
  const replay = useReplay(events, { autoplay: true, initialSpeed })
  const [view, setView] = useState<CanvasView>('canvas')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const openNode = useCallback((nodeId: string) => setSelectedNode(nodeId), [])
  const closeDrawer = useCallback(() => setSelectedNode(null), [])
  const demo = demoNote !== undefined
  const outputNode =
    replay.state.outputNodeId === undefined
      ? undefined
      : replay.state.nodes[replay.state.outputNodeId]
  const answer =
    replay.state.output ?? (outputNode?.status === 'running' ? outputNode.text : undefined)

  return (
    <div className="min-h-screen text-text-primary">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] bg-background/60 px-4 py-3 backdrop-blur-xl">
        <Link
          href={backHref}
          className="flex items-center gap-1.5 rounded-lg text-xs text-text-secondary hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {backLabel}
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <p className="mt-0.5 text-[11px] text-brand">回放 · 不消耗 token</p>
        </div>
        {headerExtra}
      </header>
      <TooltipProvider>
        <main className="mx-auto max-w-[1800px] space-y-3 p-3 sm:p-4">
          {demo ? (
            <div
              role="note"
              data-demo-banner
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 border-warning/60 bg-warning/15 px-4 py-3"
            >
              <span className="rounded-md bg-warning px-2.5 py-1 text-sm font-bold tracking-widest text-black">
                演示回放
              </span>
              <p className="min-w-0 flex-1 text-sm leading-6 text-warning">{demoNote}</p>
            </div>
          ) : null}
          <ReplayControls replay={replay} view={view} onViewChange={setView} />
          <div className="grid gap-4 xl:grid-cols-[minmax(320px,2fr)_minmax(0,3fr)]">
            <section className="glass-panel min-w-0 rounded-3xl p-4">
              <h2 className="text-[11px] font-medium text-ink-muted">任务</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">
                {task}
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
            <section
              data-tour={demo ? 'demo-canvas' : undefined}
              className="flex min-h-[560px] min-w-0 flex-col lg:h-[calc(100dvh-220px)]"
            >
              <RunHeader state={replay.state} time={replay.t} />
              <div className="relative mt-3 min-h-0 flex-1">
                {view === 'canvas' ? (
                  <RunCanvas state={replay.state} onOpen={openNode} />
                ) : (
                  <RunNodeList state={replay.state} onOpen={openNode} />
                )}
                {demo ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-3 rounded-md border border-warning/60 bg-black/70 px-2.5 py-1 text-xs font-bold tracking-widest text-warning"
                  >
                    演示回放 · 非实时运行
                  </span>
                ) : null}
              </div>
            </section>
          </div>
        </main>
      </TooltipProvider>
      <NodeDrawer state={replay.state} nodeId={selectedNode} onClose={closeDrawer} />
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { findAssistant } from '@/lib/client/find-assistant'
import { cancelRun, confirm, startRun } from '@/lib/client/run-controller'
import type { AssistantSpec } from '@/lib/contracts/assistant'
import { initialRunState } from '@/lib/run/reducer'
import { cn } from '@/lib/utils'
import { useRunStore } from '@/stores/run-store'
import { ConversationPanel, type ConversationSession } from './ConversationPanel'
import { HistoryPanel } from './HistoryPanel'
import { OrchestrationPanel } from './OrchestrationPanel'
import { TaskComposer } from './TaskComposer'

type WorkspaceTab = 'conversation' | 'canvas'

const emptyState = initialRunState()

function WorkspaceContent({ assistant }: { assistant: AssistantSpec }) {
  const storedState = useRunStore((store) => store.state)
  const storedPhase = useRunStore((store) => store.phase)
  const pendingPlan = useRunStore((store) => store.pendingPlan)
  const startError = useRunStore((store) => store.error)
  const ownsRun = storedState.assistantId === assistant.id
  const state = ownsRun ? storedState : emptyState
  const phase = ownsRun ? storedPhase : 'idle'
  const running = storedPhase === 'running' || storedPhase === 'awaiting_confirm'
  const [task, setTask] = useState('')
  const [intensity, setIntensity] = useState(assistant.defaultIntensity)
  const [confirmBeforeRun, setConfirmBeforeRun] = useState(false)
  const [ultra, setUltra] = useState(false)
  const [sessions, setSessions] = useState<ConversationSession[]>([])
  const [mobileTab, setMobileTab] = useState<WorkspaceTab>('conversation')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyCount, setHistoryCount] = useState(0)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const conversationId = useRef(0)
  const conversationScroll = useRef<HTMLDivElement>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      cancelRun()
    }
  }, [])

  useEffect(() => {
    if (phase !== 'awaiting_confirm') return
    const frame = requestAnimationFrame(() => {
      const panel = conversationScroll.current
      panel?.scrollTo({
        top: panel.scrollHeight,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [mobileTab, phase])

  const start = useCallback(
    (nextTask = task, nextIntensity = intensity, nextUltra = ultra) => {
      const normalized = nextTask.trim()
      if (normalized.length === 0 || running) return
      const id = conversationId.current + 1
      conversationId.current = id
      setIntensity(nextIntensity)
      setTask('')
      setSessions((current) => [
        ...current,
        { id, task: normalized, intensity: nextIntensity, ultra: nextUltra },
      ])
      setMobileTab('canvas')
      requestAnimationFrame(() => {
        conversationScroll.current?.scrollTo({ top: conversationScroll.current.scrollHeight })
      })
      void startRun({
        assistant,
        task: normalized,
        intensity: nextIntensity,
        ultra: nextUltra,
        confirmBeforeRun,
      }).then(() => {
        if (!mounted.current) return
        const snapshot = useRunStore.getState().state
        setSessions((current) =>
          current.map((session) =>
            session.id === id && session.snapshot === undefined
              ? { ...session, snapshot }
              : session,
          ),
        )
        setMobileTab('conversation')
        setHistoryRefresh((current) => current + 1)
      })
    },
    [assistant, confirmBeforeRun, intensity, running, task, ultra],
  )

  const stop = useCallback(() => {
    cancelRun()
    setMobileTab('conversation')
  }, [])

  const decide = useCallback((accept: boolean) => {
    confirm(accept)
    setMobileTab(accept ? 'canvas' : 'conversation')
  }, [])

  return (
    <div className="flex h-dvh min-h-[640px] flex-col overflow-hidden text-text-primary">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-background/60 px-3 backdrop-blur-xl sm:px-4">
        <Link
          href="/"
          aria-label="返回首页"
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs text-text-secondary hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">返回首页</span>
        </Link>
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-xl"
          style={{
            backgroundColor: assistant.color,
            boxShadow: `0 0 20px -4px ${assistant.color}`,
          }}
        >
          {assistant.avatar}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{assistant.name}</h1>
          <p className="hidden truncate text-[11px] text-text-secondary md:block">
            {assistant.tagline}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
          <History aria-hidden />
          历史 ({historyCount})
        </Button>
      </header>

      <Tabs
        value={mobileTab}
        onValueChange={(value) => setMobileTab(value as WorkspaceTab)}
        className="shrink-0 border-b border-border p-2 lg:hidden"
      >
        <TabsList aria-label="工作台视图" className="!w-full">
          <TabsTrigger value="conversation" aria-controls="workspace-conversation">
            对话
          </TabsTrigger>
          <TabsTrigger value="canvas" aria-controls="workspace-canvas">
            编排
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <main className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(360px,2fr)_minmax(0,3fr)] lg:gap-4 lg:p-4">
        <section
          id="workspace-conversation"
          aria-label="任务对话"
          className={cn(
            'min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-panel/40 lg:glass-panel lg:flex lg:rounded-3xl',
            mobileTab === 'conversation' ? 'flex' : 'hidden',
          )}
        >
          <div ref={conversationScroll} className="min-h-0 flex-1 overflow-y-auto p-4">
            <ConversationPanel
              assistant={assistant}
              sessions={sessions}
              state={state}
              phase={phase}
              pendingPlan={pendingPlan}
              startError={startError}
              running={running}
              onPickStarter={setTask}
              onConfirm={decide}
              onRetry={start}
            />
          </div>
          <TaskComposer
            task={task}
            onTaskChange={setTask}
            intensity={intensity}
            onIntensityChange={setIntensity}
            confirmBeforeRun={confirmBeforeRun}
            onConfirmBeforeRunChange={setConfirmBeforeRun}
            ultra={ultra}
            onUltraChange={setUltra}
            running={running}
            onSend={() => start()}
            onStop={stop}
          />
        </section>

        <section
          id="workspace-canvas"
          aria-label="编排工作区"
          className={cn(
            'min-h-0 min-w-0 flex-1 flex-col p-3 lg:flex lg:p-0',
            mobileTab === 'canvas' ? 'flex' : 'hidden lg:flex',
          )}
        >
          <OrchestrationPanel key={state.runId ?? 'empty'} state={state} phase={phase} />
        </section>
      </main>
      <HistoryPanel
        key={`${assistant.id}-${historyRefresh}`}
        assistantId={assistant.id}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onCountChange={setHistoryCount}
      />
    </div>
  )
}

export function Workspace({ id }: { id: string }) {
  const [assistant, setAssistant] = useState<AssistantSpec | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    findAssistant(id)
      .then((record) => {
        if (active) setAssistant(record ?? null)
      })
      .catch(() => {
        if (active) setAssistant(null)
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
      <main className="min-h-screen bg-background p-6 text-text-primary">
        <div role="status" aria-live="polite" className="mx-auto max-w-3xl space-y-4 pt-16">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-64 w-full" />
          <p className="text-sm text-text-secondary">{'正在读取 Agent 配置…'}</p>
        </div>
      </main>
    )
  }

  if (assistant === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center text-text-primary">
        <h1 className="text-2xl font-semibold">{'Agent 不存在'}</h1>
        <p className="mt-2 text-sm text-text-secondary">它可能已被删除，或链接不正确。</p>
        <Button className="mt-6" render={<Link href="/" />}>
          返回首页
        </Button>
      </main>
    )
  }

  return <WorkspaceContent assistant={assistant} />
}

'use client'

import {
  CheckCircle2,
  Clock3,
  HeartHandshake,
  Loader2,
  MinusCircle,
  ShieldAlert,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/markdown/Markdown'
import type { AssistantSpec } from '@/lib/contracts/assistant'
import type { Plan } from '@/lib/contracts/plan'
import type { RunState } from '@/lib/run/types'
import { cn } from '@/lib/utils'
import type { RunPhase } from '@/stores/run-store'
import { PlanConfirmBar } from './PlanConfirmBar'

export interface ConversationSession {
  id: number
  task: string
  intensity: number
  snapshot?: RunState
}

const statusLabels: Record<RunState['status'], string> = {
  idle: '待开始',
  assessing: '评估中',
  planning: '规划中',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

function Welcome({
  assistant,
  running,
  onPickStarter,
}: {
  assistant: AssistantSpec
  running: boolean
  onPickStarter: (starter: string) => void
}) {
  return (
    <section aria-label="Agent 开场示例" className="space-y-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-full text-2xl"
          style={{ backgroundColor: assistant.color }}
        >
          {assistant.avatar}
        </span>
        <div>
          <h2 className="text-base font-semibold text-text-primary">{assistant.name}</h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">{assistant.tagline}</p>
        </div>
      </div>
      {assistant.guardrails.disclaimer !== undefined ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 p-3 text-xs leading-5 text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {assistant.guardrails.disclaimer}
        </p>
      ) : null}
      <div className="space-y-2">
        {assistant.starters.map((starter, index) => (
          <button
            key={`${index}-${starter}`}
            type="button"
            disabled={running}
            onClick={() => onPickStarter(starter)}
            className="flex w-full items-start gap-2.5 rounded-xl border border-border bg-panel p-3 text-left text-sm leading-6 text-text-secondary transition-colors hover:border-brand/45 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span
              className={cn(
                'mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px]',
                index === assistant.starters.length - 1
                  ? 'border-warning/30 text-warning'
                  : 'border-brand/25 text-brand',
              )}
            >
              {index === 0 ? '简单' : index === assistant.starters.length - 1 ? '复杂' : '中等'}
            </span>
            {starter}
          </button>
        ))}
      </div>
      <p className="text-xs leading-5 text-ink-muted">
        {'试试从简单到复杂，看看子 Agent 数量怎么变化'}
      </p>
    </section>
  )
}

function Progress({ state, phase }: { state: RunState; phase: RunPhase }) {
  if (phase === 'awaiting_confirm') return null
  const text =
    state.status === 'assessing'
      ? '正在评估任务难度…'
      : state.status === 'planning'
        ? '正在规划编排…'
        : state.status === 'running'
          ? state.nodeOrder.length === 0
            ? '正在准备执行…'
            : `${state.nodeOrder.length} 个子 Agent 协作中，已完成 ${Object.values(state.nodes).filter((node) => node.status === 'completed').length}/${state.nodeOrder.length}`
          : undefined
  return text === undefined ? null : <p className="mt-2 text-xs text-text-secondary">{text}</p>
}

function SessionView({
  session,
  state,
  phase,
  pendingPlan,
  current,
  running,
  onConfirm,
  onRetry,
}: {
  session: ConversationSession
  state?: RunState
  phase: RunPhase
  pendingPlan?: Plan
  current: boolean
  running: boolean
  onConfirm: (accept: boolean) => void
  onRetry: (task: string, intensity: number) => void
}) {
  const guard = state?.assessment?.guard
  const isCrisis = guard?.kind === 'crisis'

  return (
    <article
      data-conversation-id={session.id}
      data-run-status={state?.status}
      data-current={current || undefined}
      className="space-y-3"
    >
      <div className="flex justify-end">
        <div className="max-w-[92%] rounded-2xl rounded-br-md border border-border bg-secondary px-3.5 py-2.5">
          <span className="mb-1 block text-right text-[10px] text-ink-muted">你</span>
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">
            {session.task}
          </p>
        </div>
      </div>
      {state === undefined ? (
        <p className="text-xs text-text-secondary">等待本轮运行状态…</p>
      ) : (
        <div className="rounded-2xl rounded-tl-md border border-border bg-panel/75 p-3.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 font-medium',
                state.status === 'completed'
                  ? 'text-success'
                  : state.status === 'failed'
                    ? 'text-danger'
                    : state.status === 'cancelled'
                      ? 'text-ink-muted'
                      : 'text-brand',
              )}
            >
              {state.status === 'completed' ? (
                <CheckCircle2 className="size-3.5" aria-hidden />
              ) : state.status === 'failed' ? (
                <XCircle className="size-3.5" aria-hidden />
              ) : state.status === 'cancelled' ? (
                <MinusCircle className="size-3.5" aria-hidden />
              ) : state.status === 'idle' || (current && phase === 'awaiting_confirm') ? (
                <Clock3 className="size-3.5" aria-hidden />
              ) : (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              )}
              {current && phase === 'awaiting_confirm' ? '等待确认' : statusLabels[state.status]}
            </span>
            {guard !== undefined && !isCrisis ? (
              <span className="inline-flex items-center gap-1 font-medium text-warning">
                <ShieldAlert className="size-3.5" aria-hidden />
                安全拦截
              </span>
            ) : guard === undefined && state.level !== undefined ? (
              <span className="font-mono text-brand">L{state.level}</span>
            ) : null}
            {guard === undefined && state.nodeOrder.length > 0 ? (
              <span className="text-text-secondary">子 Agent ×{state.nodeOrder.length}</span>
            ) : null}
          </div>
          {current ? <Progress state={state} phase={phase} /> : null}
          {current && phase === 'awaiting_confirm' ? (
            <PlanConfirmBar plan={pendingPlan ?? state.plan!} onConfirm={onConfirm} />
          ) : null}
          {current && state.status === 'running' && phase !== 'awaiting_confirm'
            ? (() => {
                const outputNode =
                  state.outputNodeId === undefined ? undefined : state.nodes[state.outputNodeId]
                return outputNode?.status === 'running' && outputNode.text.length > 0 ? (
                  // 流式过程中也按 Markdown 渲染，和完成后的样子一致，不会先看到一堆星号。
                  <div data-final-stream="true" className="stream-caret mt-3">
                    <Markdown>{outputNode.text}</Markdown>
                  </div>
                ) : null
              })()
            : null}
          {state.status === 'completed' ? (
            <div className="mt-3">
              {guard !== undefined && state.warnings.length > 0 && state.plan === undefined ? (
                <div
                  data-guard-blocked="true"
                  data-guard-kind={guard.kind}
                  className={cn(
                    'mb-3 flex items-center gap-2 rounded-lg border p-3 text-sm font-medium',
                    isCrisis
                      ? 'border-brand/25 bg-brand/10 text-brand'
                      : 'border-warning/25 bg-warning/10 text-warning',
                  )}
                >
                  {isCrisis ? (
                    <HeartHandshake className="size-4 shrink-0" aria-hidden />
                  ) : (
                    <ShieldAlert className="size-4 shrink-0" aria-hidden />
                  )}
                  {isCrisis ? '我们在这里' : '安全护栏已拦截'}
                </div>
              ) : null}
              {state.output !== undefined ? <Markdown>{state.output}</Markdown> : null}
              {state.degraded ? <p className="mt-3 text-xs text-warning">本次为降级交付</p> : null}
              {state.warnings.length > 0 && !isCrisis ? (
                <div className="mt-3 rounded-lg border border-warning/25 bg-warning/10 p-3 text-xs text-warning">
                  <p className="flex items-center gap-1.5 font-medium">
                    <TriangleAlert className="size-3.5" aria-hidden />
                    运行警告
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5">
                    {state.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          {state.status === 'failed' ? (
            <div className="mt-3">
              <p role="alert" className="text-sm text-danger">
                {state.error?.message ?? '运行失败'}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                disabled={running}
                onClick={() => onRetry(session.task, session.intensity)}
              >
                重试
              </Button>
            </div>
          ) : null}
          {state.status === 'cancelled' ? (
            <p className="mt-3 text-sm text-text-secondary">已停止</p>
          ) : null}
        </div>
      )}
    </article>
  )
}

export function ConversationPanel({
  assistant,
  sessions,
  state,
  phase,
  pendingPlan,
  startError,
  running,
  onPickStarter,
  onConfirm,
  onRetry,
}: {
  assistant: AssistantSpec
  sessions: ConversationSession[]
  state: RunState
  phase: RunPhase
  pendingPlan?: Plan
  startError?: string
  running: boolean
  onPickStarter: (starter: string) => void
  onConfirm: (accept: boolean) => void
  onRetry: (task: string, intensity: number) => void
}) {
  const currentId = sessions.at(-1)?.id

  return (
    <div className="space-y-5">
      {sessions.length === 0 ? (
        <Welcome assistant={assistant} running={running} onPickStarter={onPickStarter} />
      ) : (
        sessions.map((session) => (
          <SessionView
            key={session.id}
            session={session}
            state={session.id === currentId ? state : session.snapshot}
            phase={phase}
            pendingPlan={pendingPlan}
            current={session.id === currentId}
            running={running}
            onConfirm={onConfirm}
            onRetry={onRetry}
          />
        ))
      )}
      {startError !== undefined ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
        >
          {startError}
        </p>
      ) : null}
    </div>
  )
}

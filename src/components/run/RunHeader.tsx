'use client'

import {
  Bot,
  CheckCircle2,
  Clock,
  Gauge,
  HeartHandshake,
  Loader2,
  MinusCircle,
  ShieldAlert,
  Timer,
  TriangleAlert,
  Workflow,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { formatDuration, formatTokens } from '@/lib/canvas/format'
import { LEVELS } from '@/lib/orchestrator/level'
import type { RunState } from '@/lib/run/types'
import { cn } from '@/lib/utils'
import type { RunStatus } from '@/lib/contracts/run-record'

const statusInfo: Record<RunStatus, { label: string; icon: LucideIcon; className: string }> = {
  idle: { label: '待开始', icon: Clock, className: 'text-ink-muted' },
  assessing: { label: '评估中', icon: Gauge, className: 'text-brand' },
  planning: { label: '规划中', icon: Workflow, className: 'text-brand' },
  running: { label: '执行中', icon: Loader2, className: 'text-brand' },
  completed: { label: '已完成', icon: CheckCircle2, className: 'text-success' },
  failed: { label: '失败', icon: XCircle, className: 'text-danger' },
  cancelled: { label: '已取消', icon: MinusCircle, className: 'text-ink-muted' },
}

export function RunHeader({ state, time }: { state: RunState; time?: number }) {
  const status = statusInfo[state.status]
  const StatusIcon = status.icon
  const guard = state.assessment?.guard
  const level = state.decision?.level
  const decision = state.decision
  const dynamicCount = Object.values(state.nodes).filter((node) => node.dynamic).length
  const budget = state.budget
  const percentage =
    budget === undefined || budget.limit === 0
      ? 0
      : Math.min(100, (budget.used / budget.limit) * 100)

  return (
    <section
      aria-label="运行概览"
      className="rounded-2xl border border-border bg-panel/85 px-3 py-3 sm:px-4"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-current/25 bg-background/45 px-2.5 py-1 text-xs font-medium',
            status.className,
          )}
        >
          <StatusIcon
            className={cn('size-3.5', state.status === 'running' && 'canvas-spin')}
            aria-hidden
          />
          {status.label}
        </span>
        {guard !== undefined ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium',
              guard.kind === 'crisis'
                ? 'border-brand/25 bg-brand/10 text-brand'
                : 'border-warning/25 bg-warning/10 text-warning',
            )}
          >
            {guard.kind === 'crisis' ? (
              <HeartHandshake className="size-3.5" aria-hidden />
            ) : (
              <ShieldAlert className="size-3.5" aria-hidden />
            )}
            {guard.kind === 'crisis' ? '我们在这里' : '安全拦截'}
          </span>
        ) : (
          <>
            {level !== undefined ? (
              <span className="rounded-md border border-brand/25 bg-brand/10 px-2 py-1 font-mono text-[11px] text-brand">
                L{level} · {LEVELS[level].label}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
              <Bot className="size-4 text-text-primary" aria-hidden />子 Agent ×
              {state.nodeOrder.length}
              {dynamicCount > 0 ? (
                <span className="text-brand">（+{dynamicCount} 动态）</span>
              ) : null}
            </span>
            {budget !== undefined ? (
              <div className="min-w-[150px] flex-1 sm:max-w-[260px]">
                <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-text-secondary">
                  <span>TOKEN 预算</span>
                  <span className="font-mono text-text-primary">
                    {formatTokens(budget.used)} / {formatTokens(budget.limit)}
                  </span>
                </div>
                <div
                  role="meter"
                  aria-label="Token 预算"
                  aria-valuemin={0}
                  aria-valuemax={budget.limit}
                  aria-valuenow={Math.min(budget.used, budget.limit)}
                  className="h-1.5 overflow-hidden rounded-full bg-background"
                >
                  <div
                    className="h-full rounded-full bg-brand transition-[width]"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            ) : null}
          </>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-xs text-text-secondary">
          <Timer className="size-3.5" aria-hidden />
          {formatDuration(state.durationMs ?? time ?? state.lastT)}
        </span>
      </div>
      {state.assessment !== undefined ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 border-t border-border/60 pt-2 text-[11px]">
          <span className="text-text-secondary">{state.assessment.rationale}</span>
          {decision !== undefined && guard === undefined ? (
            <span className="text-ink-muted">
              得分 {decision.rawScore} {decision.adjustment >= 0 ? '+' : ''}
              {decision.adjustment} = {decision.score}
            </span>
          ) : null}
        </div>
      ) : null}
      {state.warnings.length > 0 && guard?.kind !== 'crisis' ? (
        <details className="mt-2 border-t border-border/60 pt-2 text-[11px]">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 text-warning">
            <TriangleAlert className="size-3.5" aria-hidden />
            {state.warnings.length} 条运行警告
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-text-secondary">
            {state.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}

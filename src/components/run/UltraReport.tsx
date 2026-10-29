'use client'

import { Check, Compass, Loader2, Zap } from 'lucide-react'
import { LANE_LABELS, ultraReport } from '@/lib/orchestrator/ultra'
import type { RunState } from '@/lib/run/types'
import { cn } from '@/lib/utils'

/** Ultra 多路战报：每个环节一行，实时显示并行路数、采用的取向、得分与方向校准结果。 */
export function UltraReport({ state }: { state: RunState }) {
  const rows = ultraReport(state)
  if (rows.length === 0) return null
  const decided = rows.filter((row) => row.winner !== undefined).length
  const corrected = rows.filter((row) => row.corrected).length
  const lanes = rows.reduce((sum, row) => sum + row.lanes, 0)

  return (
    <div
      aria-label="Ultra 多路战报"
      className="mt-2.5 border-t border-border/60 pt-2 text-[11px]"
      data-ultra-report
    >
      <p className="flex flex-wrap items-center gap-x-2 text-text-secondary">
        <Zap className="size-3.5 fill-current text-ultra" aria-hidden />
        <span className="ultra-text font-semibold">多路战报</span>
        <span>
          {rows.length} 个环节 · 共 {lanes} 路并行 · 已择优 {decided}/{rows.length}
          {corrected > 0 ? ` · 方向纠偏 ${corrected} 处` : ''}
        </span>
      </p>
      <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
        {rows.map((row) => (
          <li
            key={row.group}
            className="flex min-w-0 items-center gap-2 rounded-md border border-ultra/15 bg-background/40 px-2 py-1"
          >
            <span className="min-w-0 flex-1 truncate text-text-primary">{row.title}</span>
            <span
              className={cn(
                'shrink-0 font-mono text-[10px]',
                row.winner !== undefined && row.finished < row.lanes
                  ? 'text-warning'
                  : 'text-ink-muted',
              )}
              title={
                row.winner !== undefined && row.finished < row.lanes
                  ? `${row.lanes - row.finished} 路未能完成`
                  : undefined
              }
            >
              {row.winner !== undefined && row.finished < row.lanes
                ? `${row.finished}/${row.lanes} 路`
                : `${row.lanes} 路`}
            </span>
            {row.winner === undefined ? (
              <span className="inline-flex items-center gap-1 text-ink-muted">
                {row.status === 'pending' ? (
                  '待执行'
                ) : (
                  <>
                    <Loader2 className="canvas-spin size-3" aria-hidden />
                    并行中
                  </>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Check className="size-3 text-ultra" aria-hidden />
                <span className="text-ultra">{LANE_LABELS[row.winner]}</span>
                {row.winnerScore !== undefined ? (
                  <span className="font-mono text-ink-muted">{row.winnerScore}</span>
                ) : row.finished === 1 ? (
                  <span className="text-[10px] text-warning">直接采用</span>
                ) : null}
                {row.tie ? (
                  <span
                    className="rounded border border-ultra/30 px-0.5 text-[9px] text-ultra/80"
                    title="总分并列，按两次评审的平均名次判定"
                  >
                    并列
                  </span>
                ) : null}
              </span>
            )}
            {row.alignScore !== undefined ? (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5',
                  row.corrected ? 'text-warning' : 'text-success',
                )}
                title={row.corrected ? '方向校准后纠偏' : '方向校准一致'}
              >
                <Compass className="size-3" aria-hidden />
                {row.alignScore}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

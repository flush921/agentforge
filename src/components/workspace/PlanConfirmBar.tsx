'use client'

import { Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatTokens } from '@/lib/canvas/format'
import type { Plan } from '@/lib/contracts/plan'
import { LEVELS } from '@/lib/orchestrator/level'

export function PlanConfirmBar({
  plan,
  onConfirm,
}: {
  plan: Plan
  onConfirm: (accept: boolean) => void
}) {
  return (
    <section
      aria-label="执行前确认"
      className="mt-3 rounded-xl border border-brand/35 bg-brand/10 p-3.5"
    >
      <h3 className="text-sm font-semibold text-brand">执行前确认</h3>
      <p className="mt-2 text-sm leading-6 text-text-primary">{plan.strategy}</p>
      <p className="mt-2 text-xs text-text-secondary">
        {plan.nodes.length} 个环节 · 预计 token 预算 {formatTokens(LEVELS[plan.level].budget)}
      </p>
      <p className="mt-1 text-[11px] text-text-secondary">
        编排已生成，确认后才会执行 Agent 节点。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => onConfirm(true)}>
          <Play aria-hidden />
          开始执行
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onConfirm(false)}>
          <X aria-hidden />
          取消
        </Button>
      </div>
    </section>
  )
}

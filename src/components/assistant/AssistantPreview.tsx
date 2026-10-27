'use client'

import {
  BookOpen,
  Calculator,
  ChartColumn,
  Clock3,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AssistantDraft } from '@/lib/contracts/assistant'
import type { Capability } from '@/lib/contracts/common'
import { CAPABILITY_LABELS, DIRECTION_LABELS, isCapabilityAvailable } from '@/lib/assistant/labels'
import { cn } from '@/lib/utils'

const capabilityIcons: Record<Capability, LucideIcon> = {
  web_search: Search,
  calculator: Calculator,
  datetime: Clock3,
  chart: ChartColumn,
  knowledge_base: BookOpen,
  image_input: ImageIcon,
}

export function AssistantPreview({
  draft,
  saving,
  saveError,
  onSave,
  onRegenerate,
}: {
  draft: AssistantDraft
  saving: boolean
  saveError: string | null
  onSave: () => void
  onRegenerate: () => void
}) {
  return (
    <section
      aria-label="Agent 预览"
      aria-busy={saving}
      data-testid="assistant-preview"
      className="spotlight glass-panel rounded-3xl !border-brand/30 p-4 sm:p-6"
    >
      <header className="flex items-center gap-3.5">
        <span
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-full text-3xl shadow-lg shadow-black/15"
          style={{ backgroundColor: draft.color }}
        >
          {draft.avatar}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-text-primary">{draft.name}</h2>
            <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] text-brand">
              {draft.domain}
            </span>
            {draft.directions.map((direction) => (
              <span
                key={direction}
                data-scene-tag={direction}
                className="rounded-full border border-border/70 bg-background/45 px-2 py-0.5 text-[10px] text-text-secondary"
              >
                {DIRECTION_LABELS[direction]}
              </span>
            ))}
          </div>
          <p className="mt-1 text-sm leading-5 text-text-secondary">{draft.tagline}</p>
        </div>
      </header>

      <section className="mt-6" aria-label="Agent 能力">
        <h3 className="text-sm font-medium text-text-primary">能力组合</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {draft.capabilities.map((capability) => {
            const available = isCapabilityAvailable(capability)
            const Icon = capabilityIcons[capability]
            return (
              <li
                key={capability}
                data-available={available}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2.5 text-xs',
                  available
                    ? 'border-border bg-background/50 text-text-primary'
                    : 'border-border/60 bg-background/25 text-text-secondary',
                )}
              >
                <Icon
                  className={cn('size-4 shrink-0', available ? 'text-success' : 'text-ink-muted')}
                  aria-hidden
                />
                <span className="truncate">{CAPABILITY_LABELS[capability]}</span>
                <span
                  className={cn(
                    'ml-auto shrink-0 text-[10px]',
                    available ? 'text-success' : 'text-text-secondary',
                  )}
                >
                  {available ? '已启用' : '即将支持'}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <details className="mt-5 rounded-xl border border-border bg-background/35 p-3.5">
        <summary className="cursor-pointer rounded text-sm font-medium text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-brand">
          人设与专业边界
        </summary>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
          {draft.persona}
        </p>
      </details>

      {draft.guardrails.disclaimer !== undefined || draft.guardrails.refuseTopics.length > 0 ? (
        <section className="mt-5" aria-label="安全护栏">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
            <ShieldCheck className="size-4 text-brand" aria-hidden />
            安全护栏
          </h3>
          {draft.guardrails.disclaimer !== undefined ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 p-3 text-xs leading-5 text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{draft.guardrails.disclaimer}</span>
            </p>
          ) : null}
          {draft.guardrails.refuseTopics.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-text-secondary">会礼貌拒绝：</span>
              {draft.guardrails.refuseTopics.map((topic, index) => (
                <span
                  key={`${index}-${topic}`}
                  className="rounded-md border border-border bg-background/45 px-2 py-1 text-[11px] text-text-secondary"
                >
                  {topic}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-6" aria-label="开场示例">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium text-text-primary">开场示例</h3>
          <span className="text-[11px] text-ink-muted">由易到难</span>
        </div>
        <ol className="mt-3 divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-background/35">
          {draft.starters.map((starter, index) => (
            <li key={`${index}-${starter}`} className="flex items-start gap-3 p-3">
              <span
                className={cn(
                  'mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px]',
                  index === draft.starters.length - 1
                    ? 'border-warning/30 text-warning'
                    : 'border-brand/25 text-brand',
                )}
              >
                {index === 0 ? '简单' : index === draft.starters.length - 1 ? '复杂' : '中等'}
              </span>
              <span className="min-w-0 text-sm leading-6 text-text-secondary">{starter}</span>
            </li>
          ))}
        </ol>
      </section>

      {saveError !== null ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {saveError}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-2.5 border-t border-border/70 pt-4">
        <Button type="button" variant="outline" disabled={saving} onClick={onRegenerate}>
          <RotateCcw aria-hidden />
          重新生成
        </Button>
        <Button type="button" disabled={saving} onClick={onSave} className="glow-button">
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {saving ? '正在保存…' : '保存并开始使用'}
        </Button>
      </div>
    </section>
  )
}

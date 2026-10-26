'use client'

import { Slider } from '@/components/ui/slider'
import { intensityAdjustment } from '@/lib/orchestrator/level'

export function IntensityDial({
  value,
  onChange,
  disabled = false,
}: {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  const adjustment = intensityAdjustment(value)

  return (
    <div className="min-w-40 flex-1">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] text-text-secondary">
        <span>快省 ⚡</span>
        <span className="font-mono text-brand">
          调整 {adjustment >= 0 ? '+' : ''}
          {adjustment}
        </span>
        <span>深准 🎯</span>
      </div>
      <Slider
        aria-label="编排强度"
        min={0}
        max={1}
        step={0.05}
        value={[value]}
        disabled={disabled}
        onValueChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? value) : next)}
      />
    </div>
  )
}

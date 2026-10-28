'use client'

import { THEMES } from '@/lib/visual/theme'
import { cn } from '@/lib/utils'
import { setTheme, useTheme } from './use-theme'

/** 右下角的风格切换器，用于对比各版视觉。 */
export function ThemeSwitcher() {
  const current = useTheme()
  return (
    <div
      role="radiogroup"
      aria-label="视觉风格"
      className="glass-panel fixed bottom-3 right-3 z-30 hidden gap-0.5 lg:flex rounded-full p-1 print:hidden"
    >
      {THEMES.map((theme) => (
        <button
          key={theme.id}
          type="button"
          role="radio"
          aria-checked={current === theme.id}
          onClick={() => setTheme(theme.id)}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            current === theme.id
              ? 'bg-white/10 text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ backgroundColor: theme.swatch, boxShadow: `0 0 8px ${theme.swatch}` }}
          />
          {theme.label}
        </button>
      ))}
    </div>
  )
}

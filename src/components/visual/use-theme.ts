'use client'

import { useSyncExternalStore } from 'react'
import { DEFAULT_THEME, parseTheme, THEME_STORAGE_KEY, type ThemeId } from '@/lib/visual/theme'

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

function getSnapshot(): ThemeId {
  return parseTheme(document.documentElement.dataset.theme)
}

function getServerSnapshot(): ThemeId {
  return DEFAULT_THEME
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function setTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // 隐私模式下无法写入时，仅本次会话生效。
  }
}

/** 读取当前风格的 CSS 变量（如 `--brand`），供 Canvas 背景取色。 */
export function readCssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value.length > 0 ? value : fallback
}

/** `#rrggbb` → `rgba(r,g,b,a)`；非十六进制颜色原样返回。 */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (match === null) return hex
  const value = Number.parseInt(match[1]!, 16)
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`
}

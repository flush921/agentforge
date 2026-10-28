/** 视觉风格：同一套组件，靠 `<html data-theme>` 切换配色、面板质感与背景动效。 */

export const THEMES = [
  { id: 'aurora', label: '极光', swatch: '#22d3ee' },
  { id: 'hud', label: '指挥舱', swatch: '#c6ff3d' },
  { id: 'nebula', label: '星云', swatch: '#b794ff' },
  { id: 'stellar', label: '星辰', swatch: '#e8efff' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const DEFAULT_THEME: ThemeId = 'stellar'
export const THEME_STORAGE_KEY = 'af-theme'

export function isTheme(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((theme) => theme.id === value)
}

export function parseTheme(value: unknown): ThemeId {
  return isTheme(value) ? value : DEFAULT_THEME
}

/**
 * 首屏前执行的内联脚本：优先读取 `?theme=`（便于截图与分享），其次读取本地记忆。
 * 必须在 hydration 之前设置属性，否则会先闪一下默认风格。
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var ids=${JSON.stringify(
  THEMES.map((theme) => theme.id),
)};var q=new URLSearchParams(location.search).get('theme');var t=q||localStorage.getItem('${THEME_STORAGE_KEY}');if(q&&ids.indexOf(q)>=0)localStorage.setItem('${THEME_STORAGE_KEY}',q);if(ids.indexOf(t)>=0)document.documentElement.dataset.theme=t}catch(e){}})()`

import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, isTheme, parseTheme, THEME_BOOT_SCRIPT, THEMES } from './theme'

describe('theme', () => {
  it('只接受已定义的风格，其余回退到默认风格', () => {
    for (const theme of THEMES) expect(isTheme(theme.id)).toBe(true)
    expect(parseTheme('hud')).toBe('hud')
    expect(parseTheme('unknown')).toBe(DEFAULT_THEME)
    expect(parseTheme(undefined)).toBe(DEFAULT_THEME)
    expect(parseTheme('__proto__')).toBe(DEFAULT_THEME)
  })

  it('首屏脚本内嵌全部风格 id，且不含闭合 script 标签', () => {
    for (const theme of THEMES) expect(THEME_BOOT_SCRIPT).toContain(`"${theme.id}"`)
    expect(THEME_BOOT_SCRIPT).not.toMatch(/<\/script/i)
  })
})

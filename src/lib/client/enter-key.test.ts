import { describe, expect, it } from 'vitest'
import { enterAction, insertNewline, type EnterKeyEvent } from './enter-key'

function key(overrides: Partial<EnterKeyEvent>): EnterKeyEvent {
  return {
    key: 'Enter',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    ...overrides,
  }
}

describe('enterAction', () => {
  it('单独按 Enter 发送', () => {
    expect(enterAction(key({}))).toBe('send')
  })

  it('Ctrl+Enter 与 ⌘+Enter 换行', () => {
    expect(enterAction(key({ ctrlKey: true }))).toBe('newline')
    expect(enterAction(key({ metaKey: true }))).toBe('newline')
  })

  it('Shift+Enter 交给浏览器默认换行，不发送', () => {
    expect(enterAction(key({ shiftKey: true }))).toBe('default')
  })

  it('输入法选词时的 Enter 不发送', () => {
    expect(enterAction(key({ isComposing: true }))).toBe('default')
  })

  it('其他键与 Alt+Enter 不处理', () => {
    expect(enterAction(key({ key: 'a' }))).toBe('default')
    expect(enterAction(key({ altKey: true }))).toBe('default')
  })
})

describe('insertNewline', () => {
  it('在光标处插入换行，光标移到换行之后', () => {
    expect(insertNewline('ab', 1, 1)).toEqual({ value: 'a\nb', caret: 2 })
  })

  it('有选区时用换行替换选中的文字', () => {
    expect(insertNewline('abcd', 1, 3)).toEqual({ value: 'a\nd', caret: 2 })
  })
})

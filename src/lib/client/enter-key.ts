/** 输入框里按下的键，只取判断「是否发送」需要的字段，便于单元测试。 */
export interface EnterKeyEvent {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  /** 正在用输入法拼写（中文选词时的 Enter 只是确认候选词）。 */
  isComposing: boolean
}

export type EnterAction = 'send' | 'newline' | 'default'

/**
 * 聊天式输入框的回车约定：Enter 发送；Ctrl/⌘/Shift + Enter 换行；输入法选词时的 Enter 不发送。
 * 返回 'newline' 时调用方要自己插入换行——Ctrl+Enter 在浏览器里默认不会换行。
 */
export function enterAction(event: EnterKeyEvent): EnterAction {
  if (event.key !== 'Enter' || event.isComposing || event.altKey) return 'default'
  if (event.shiftKey) return 'default'
  if (event.ctrlKey || event.metaKey) return 'newline'
  return 'send'
}

/**
 * 输入框 onKeyDown 的通用处理：Enter 调用 send；Ctrl/⌘+Enter 在光标处插入换行并通过 onChange 回写。
 * 换行后用 requestAnimationFrame 把光标放回正确位置，因为受控输入框重渲染后光标会跳到末尾。
 */
export function handleEnterKey(
  event: {
    key: string
    shiftKey: boolean
    ctrlKey: boolean
    metaKey: boolean
    altKey: boolean
    nativeEvent: { isComposing: boolean }
    currentTarget: HTMLTextAreaElement
    preventDefault(): void
  },
  send: () => void,
  onChange: (value: string) => void,
): void {
  const action = enterAction({
    key: event.key,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    isComposing: event.nativeEvent.isComposing,
  })
  if (action === 'default') return
  event.preventDefault()
  if (action === 'send') {
    send()
    return
  }
  const target = event.currentTarget
  const next = insertNewline(target.value, target.selectionStart, target.selectionEnd)
  if (target.maxLength > 0 && next.value.length > target.maxLength) return
  onChange(next.value)
  requestAnimationFrame(() => target.setSelectionRange(next.caret, next.caret))
}

/** 在光标处插入换行，返回新文本和新的光标位置。 */
export function insertNewline(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): { value: string; caret: number } {
  const next = `${value.slice(0, selectionStart)}\n${value.slice(selectionEnd)}`
  return { value: next, caret: selectionStart + 1 }
}

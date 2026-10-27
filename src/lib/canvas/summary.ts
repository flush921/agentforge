import type { NodeState } from '../run/types'

export type SummaryTone = 'normal' | 'muted' | 'danger'

export interface AgentSummary {
  text: string
  tone: SummaryTone
  streaming: boolean
}

const MAX_SUMMARY_LENGTH = 40

/** 末尾截断：保留开头，超出的部分用 `…` 后缀标记。 */
function truncateEnd(text: string): string {
  if (text.length <= MAX_SUMMARY_LENGTH) {
    return text
  }
  return `${text.slice(0, MAX_SUMMARY_LENGTH)}…`
}

/** 开头截断：保留末尾（最新内容），缺失的开头用 `…` 前缀标记。 */
function truncateStart(text: string): string {
  if (text.length <= MAX_SUMMARY_LENGTH) {
    return text
  }
  return `…${text.slice(-MAX_SUMMARY_LENGTH)}`
}

/**
 * 去掉行内的 Markdown 强调标记（`**`、`__`、`~~`、反引号）。
 * 摘要只显示一行纯文本，流式中途常出现未闭合的 `**`，直接删掉比配对解析更稳。
 */
function stripInlineMarks(line: string): string {
  return line.replace(/\*\*|__|~~|`/g, '')
}

function lastContentLine(text: string): string {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = stripInlineMarks((lines[i] ?? '').replace(/^(?:[#>*|\s-]|\d+\.)+/, '')).trim()
    if (line) {
      return line
    }
  }
  return ''
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed) {
      return trimmed
    }
  }
  return ''
}

/** 去掉行首的 Markdown 标记（`#`、`>`、`-`、`*`）和空格。 */
function stripLinePrefix(line: string): string {
  return line.replace(/^[#>\-*\s]+/, '')
}

export function agentSummary(ns: NodeState): AgentSummary {
  if (ns.status === 'pending') {
    return { text: '等待上游', tone: 'muted', streaming: false }
  }

  if (ns.status === 'running') {
    const inFlight = ns.toolCalls.find((call) => call.ok === undefined)
    if (inFlight) {
      return { text: `调用 ${inFlight.tool}…`, tone: 'normal', streaming: false }
    }

    const line = lastContentLine(ns.text)
    if (line) {
      return { text: truncateStart(line), tone: 'normal', streaming: true }
    }

    if (ns.text.trim()) {
      return { text: '撰写中…', tone: 'normal', streaming: false }
    }

    if (ns.reasoning.trim()) {
      return { text: '思考中…', tone: 'normal', streaming: false }
    }

    return { text: '启动中…', tone: 'normal', streaming: false }
  }

  if (ns.status === 'completed') {
    const line = ns.output
      ? stripInlineMarks(stripLinePrefix(firstNonEmptyLine(ns.output))).trim()
      : ''
    return { text: truncateEnd(line), tone: 'normal', streaming: false }
  }

  if (ns.status === 'failed') {
    return { text: truncateEnd(ns.error?.message ?? '执行失败'), tone: 'danger', streaming: false }
  }

  return { text: truncateEnd(ns.skipReason ?? '已跳过'), tone: 'muted', streaming: false }
}

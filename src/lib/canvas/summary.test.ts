import { describe, expect, it } from 'vitest'
import type { PlanNode } from '../contracts/plan'
import type { NodeState } from '../run/types'
import { formatDuration, formatTokens, roleInfo } from './format'
import { agentSummary } from './summary'

function nodeState(overrides: Partial<NodeState>): NodeState {
  const planNode: PlanNode = {
    id: 'n1',
    role: 'writer',
    title: '写作',
    instruction: '写',
    dependsOn: [],
    tools: [],
  }
  return {
    node: planNode,
    status: 'pending',
    dynamic: false,
    attempt: 0,
    text: '',
    reasoning: '',
    toolCalls: [],
    ...overrides,
  }
}

describe('agentSummary', () => {
  it('pending 返回「等待上游」（muted）', () => {
    expect(agentSummary(nodeState({ status: 'pending' }))).toEqual({
      text: '等待上游',
      tone: 'muted',
      streaming: false,
    })
  })

  it('running 且有未返回结果的工具调用', () => {
    const summary = agentSummary(
      nodeState({
        status: 'running',
        toolCalls: [{ callId: 'c1', tool: 'web_search', input: {} }],
      }),
    )
    expect(summary).toEqual({ text: '调用 web_search…', tone: 'normal', streaming: false })
  })

  it('running 有 text：返回最后一个非空行并标记 streaming', () => {
    const summary = agentSummary(nodeState({ status: 'running', text: '第一段\n\n第二段还在写\n' }))
    expect(summary).toEqual({ text: '第二段还在写', tone: 'normal', streaming: true })
  })

  it.each([
    ['## 环节', '环节'],
    ['前文\n###', '前文'],
    ['| a | b |', 'a | b |'],
    ['1. 第一步', '第一步'],
    ['###', '撰写中…'],
    ['###\n| \n1.\n##', '撰写中…'],
  ])('running 清理行首 Markdown 标记：%s', (text, expected) => {
    expect(agentSummary(nodeState({ status: 'running', text })).text).toBe(expected)
  })

  it('running 只有 reasoning：「思考中…」', () => {
    const summary = agentSummary(nodeState({ status: 'running', reasoning: '先想想' }))
    expect(summary).toEqual({ text: '思考中…', tone: 'normal', streaming: false })
  })

  it('running 什么都没有：「启动中…」', () => {
    const summary = agentSummary(nodeState({ status: 'running' }))
    expect(summary).toEqual({ text: '启动中…', tone: 'normal', streaming: false })
  })

  it('completed 返回 output 第一个非空行并去掉行首标记', () => {
    const summary = agentSummary(
      nodeState({ status: 'completed', output: '# 报告标题\n\n正文内容' }),
    )
    expect(summary).toEqual({ text: '报告标题', tone: 'normal', streaming: false })

    for (const prefix of ['>', '-', '*']) {
      const withPrefix = agentSummary(
        nodeState({ status: 'completed', output: `${prefix} 引用行` }),
      )
      expect(withPrefix.text).toBe('引用行')
    }
  })

  it('failed 返回 error.message（danger）', () => {
    const summary = agentSummary(
      nodeState({
        status: 'failed',
        error: { code: 'timeout', message: '模型请求超时' },
      }),
    )
    expect(summary).toEqual({ text: '模型请求超时', tone: 'danger', streaming: false })
  })

  it('skipped 返回 skipReason（muted）', () => {
    const summary = agentSummary(nodeState({ status: 'skipped', skipReason: '未执行' }))
    expect(summary).toEqual({ text: '未执行', tone: 'muted', streaming: false })
  })

  it('截断：末尾截断加 … 后缀，开头截断加 … 前缀', () => {
    const longLine = '一'.repeat(50)
    const completed = agentSummary(nodeState({ status: 'completed', output: longLine }))
    expect(completed.text).toBe(`${'一'.repeat(40)}…`)
    expect(completed.text).toHaveLength(41)

    const running = agentSummary(nodeState({ status: 'running', text: longLine }))
    expect(running.text).toBe(`…${'一'.repeat(40)}`)
    expect(running.text).toHaveLength(41)

    const exact = agentSummary(nodeState({ status: 'completed', output: '一'.repeat(40) }))
    expect(exact.text).toBe('一'.repeat(40))
  })
})

describe('formatTokens', () => {
  it('小于 1000 原样显示', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })

  it('千级：x.yK，去掉 .0', () => {
    expect(formatTokens(1000)).toBe('1K')
    expect(formatTokens(1200)).toBe('1.2K')
    expect(formatTokens(999999)).toBe('1000K')
  })

  it('百万级：x.yM，去掉 .0', () => {
    expect(formatTokens(1_000_000)).toBe('1M')
    expect(formatTokens(1_500_000)).toBe('1.5M')
    expect(formatTokens(2_000_000)).toBe('2M')
  })
})

describe('formatDuration', () => {
  it('小于 60 秒显示为 x.xs', () => {
    expect(formatDuration(0)).toBe('0.0s')
    expect(formatDuration(12_400)).toBe('12.4s')
    expect(formatDuration(59_999)).toBe('60.0s')
  })

  it('超过 60 秒显示为 xM yy s', () => {
    expect(formatDuration(60_000)).toBe('1m 00s')
    expect(formatDuration(65_000)).toBe('1m 05s')
    expect(formatDuration(125_000)).toBe('2m 05s')
  })
})

describe('roleInfo', () => {
  it('族划分符合 canvas.md §2', () => {
    expect(roleInfo('researcher')).toEqual({ family: 'gather', label: '调研' })
    expect(roleInfo('analyst').family).toBe('reason')
    expect(roleInfo('coder').family).toBe('reason')
    expect(roleInfo('specialist').family).toBe('reason')
    expect(roleInfo('writer').family).toBe('produce')
    expect(roleInfo('synthesizer').family).toBe('produce')
    expect(roleInfo('reviewer')).toEqual({ family: 'review', label: '审校' })
  })
})

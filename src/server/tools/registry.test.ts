import { describe, expect, it } from 'vitest'
import { buildToolSet, summarizeToolResult } from './registry'

describe('buildToolSet', () => {
  it('只构建已实现的工具并去重', () => {
    const tools = buildToolSet(['web_search', 'datetime', 'datetime', 'kb_search', 'calculator'])
    expect(Object.keys(tools)).toEqual(['datetime', 'calculator'])
    expect(buildToolSet(['web_search', 'kb_search'])).toEqual({})
  })
})

describe('summarizeToolResult', () => {
  it('datetime 使用固定摘要格式', () => {
    expect(
      summarizeToolResult('datetime', {
        date: '2026-10-26',
        time: '14:03',
        weekday: '星期一',
        timezone: 'Asia/Shanghai',
        iso: '2026-10-26T06:03:00.000Z',
      }),
    ).toBe('2026-10-26 星期一 14:03（Asia/Shanghai）')
  })

  it('calculator 使用表达式和格式化结果', () => {
    expect(
      summarizeToolResult('calculator', {
        expression: '(128*3*0.85-40)',
        result: 286.4,
        formatted: '286.4',
      }),
    ).toBe('(128*3*0.85-40) = 286.4')
  })

  it('calculator 摘要不超过 300 字', () => {
    const summary = summarizeToolResult('calculator', {
      expression: 'x'.repeat(200),
      result: 1,
      formatted: '1'.repeat(200),
    })
    expect(summary).toHaveLength(300)
  })

  it('未知工具 JSON 摘要截断到 300 字', () => {
    const summary = summarizeToolResult('web_search', { text: '长'.repeat(400) })
    expect(summary).toHaveLength(300)
    expect(summary.startsWith('{"text":"')).toBe(true)
  })
})

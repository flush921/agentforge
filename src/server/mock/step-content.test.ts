import { describe, expect, it } from 'vitest'
import { buildMockStepContent, type MockStepContentInput } from './step-content'

const base: MockStepContentInput = {
  role: 'researcher',
  title: '现状调研',
  instruction: '整理任务所需的关键资料',
  task: '调研大学生使用 AI 学习工具的现状并写出完整分析报告',
  upstreamTitles: ['需求梳理', '资料准备'],
  isFinal: false,
}

describe('buildMockStepContent', () => {
  it('中间节点使用要点列表并包含所有输入信息', () => {
    const content = buildMockStepContent(base)
    expect(content).toContain('- 环节角色：researcher')
    expect(content).toContain('现状调研')
    expect(content).toContain('整理任务所需的关键资料')
    expect(content).toContain(base.task.slice(0, 30))
    expect(content).toContain('需求梳理、资料准备')
    expect(content.length).toBeGreaterThanOrEqual(150)
    expect(content.length).toBeLessThanOrEqual(400)
  })

  it('最终节点以离线提示开头并使用 Markdown 标题', () => {
    const content = buildMockStepContent({ ...base, isFinal: true })
    expect(content.startsWith('> 当前为离线演示模式，内容由模板生成。')).toBe(true)
    expect(content).toContain('# 现状调研')
  })

  it('返工节点复述 feedback 第一行', () => {
    const content = buildMockStepContent({
      ...base,
      revision: { feedback: '补充数据依据\n压缩重复段落' },
    })
    expect(content.startsWith('已根据审校意见修订：补充数据依据')).toBe(true)
    expect(content).not.toContain('压缩重复段落')
  })

  it('final 返工同时保留离线提示和修订说明', () => {
    const content = buildMockStepContent({
      ...base,
      isFinal: true,
      revision: { feedback: '补充数据依据' },
    })
    expect(content.startsWith('> 当前为离线演示模式，内容由模板生成。')).toBe(true)
    expect(content).toContain('已根据审校意见修订：补充数据依据')
  })

  it('最终节点的离线提示下一行是空行', () => {
    const content = buildMockStepContent({
      ...base,
      isFinal: true,
      revision: { feedback: '补充数据依据' },
    })
    const lines = content.split('\n')

    expect(lines[0]).toBe('> 当前为离线演示模式，内容由模板生成。')
    expect(lines[1]).toBe('')
  })

  it('最终节点标题去掉修订和复核前缀', () => {
    for (const title of ['修订·报告写作', '复核·报告写作', '修订·复核·报告写作']) {
      const content = buildMockStepContent({ ...base, title, isFinal: true })

      expect(content).toContain('# 报告写作')
      expect(content).not.toContain(`# ${title}`)
    }
  })

  it('长输入截断到 400 字以内', () => {
    const content = buildMockStepContent({
      ...base,
      task: '长'.repeat(4000),
      instruction: '长'.repeat(600),
      upstreamTitles: Array.from({ length: 6 }, (_, index) => `${index}${'题'.repeat(16)}`),
    })
    expect(content).toHaveLength(400)
  })
})

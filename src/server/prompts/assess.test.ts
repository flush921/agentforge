import { describe, expect, it } from 'vitest'
import { testAssistant } from '@/test/fixtures'
import { buildAssessPrompt } from './assess'
import { INJECTION_NOTICE } from './shared'

describe('buildAssessPrompt', () => {
  const result = buildAssessPrompt(testAssistant, '对比三款笔记软件并给出选购建议')

  it('包含数据区、注入声明和评分规则', () => {
    expect(result.user).toContain('<assistant>\n名称：学习助手')
    expect(result.user).toContain('<task>\n对比三款笔记软件并给出选购建议\n</task>')
    expect(result.user.endsWith(INJECTION_NOTICE)).toBe(true)
    expect(result.instructions).toContain('只输出一个 JSON 对象')
    expect(result.instructions).toContain('subtasks 子任务数')
    expect(result.instructions).toContain('rigor 严谨要求')
    expect(result.instructions).toContain('安全判断（同时完成）')
    expect(result.instructions).toContain('"guard":{"blocked":false,"reason":"","topic":false}')
  })

  it('固定输入快照', () => {
    expect(result).toMatchSnapshot()
  })
})

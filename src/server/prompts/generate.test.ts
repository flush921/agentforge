import { describe, expect, it } from 'vitest'
import { buildGeneratePrompt } from './generate'
import { INJECTION_NOTICE } from './shared'

describe('buildGeneratePrompt', () => {
  const result = buildGeneratePrompt('帮我做一个考研择校顾问')

  it('包含数据区、注入声明和 JSON 输出要求', () => {
    expect(result.user).toContain('<request>\n帮我做一个考研择校顾问\n</request>')
    expect(result.user.endsWith(INJECTION_NOTICE)).toBe(true)
    expect(result.instructions).toContain('只输出一个 JSON 对象')
    expect(result.instructions).toContain('- agent：通用智能体助手')
    expect(result.instructions).toContain('- datetime：获取当前日期与时间')
  })

  it('固定输入快照', () => {
    expect(result).toMatchSnapshot()
  })
})

import { describe, expect, it } from 'vitest'
import { MOCK_ASSISTANTS } from '@/server/mock/assistants'
import { fakeLlm } from '@/test/fake-llm'
import { generateAssistant } from './generate'

const validText = JSON.stringify(MOCK_ASSISTANTS.study)
const signal = new AbortController().signal

describe('generateAssistant', () => {
  it('第一次输出合法时直接成功', async () => {
    const { client, requests } = fakeLlm([validText])
    const result = await generateAssistant(client, '帮我做学习规划', signal)

    expect(result).toMatchObject({ ok: true, value: { name: '学业规划' } })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      kind: 'generate',
      temperature: 0.8,
      maxOutputTokens: 1500,
    })
  })

  it('第一次失败后携带原文和错误列表重试成功', async () => {
    const { client, requests } = fakeLlm(['不是 JSON', validText])
    const result = await generateAssistant(client, '帮我做学习规划', signal)

    expect(result).toMatchObject({ ok: true, value: { name: '学业规划' } })
    expect(requests).toHaveLength(2)
    expect(requests[1]?.messages).toHaveLength(3)
    expect(requests[1]?.messages[1]).toEqual({ role: 'assistant', content: '不是 JSON' })
    expect(requests[1]?.messages[2]?.content).toContain('- JSON 解析失败')
  })

  it('两次都不合法时返回 invalid_output', async () => {
    const { client, requests } = fakeLlm(['不是 JSON', '{}'])
    const result = await generateAssistant(client, '帮我做学习规划', signal)

    expect(result).toEqual({ ok: false, error: new Error('invalid_output') })
    expect(requests).toHaveLength(2)
  })

  it('模型调用异常时不进入输出修复', async () => {
    const error = new Error('network failed')
    const { client, requests } = fakeLlm([error, validText])
    const result = await generateAssistant(client, '帮我做学习规划', signal)

    expect(result).toEqual({ ok: false, error })
    expect(requests).toHaveLength(1)
  })
})

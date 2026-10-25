import { describe, expect, it } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { parseEnv } from '@/server/env-schema'
import { createDeepSeekClient } from './deepseek'
import type { LlmJsonRequest } from './types'

const env = parseEnv({ LLM_MODE: 'live', DEEPSEEK_API_KEY: 'unit-test-key' })

function mockModel(text: string, inputTokens?: number, outputTokens?: number) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: {
          total: inputTokens,
          noCache: inputTokens,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: outputTokens,
          text: outputTokens,
          reasoning: undefined,
        },
      },
      warnings: [],
    }),
  })
}

function makeRequest(signal = new AbortController().signal): LlmJsonRequest {
  return {
    kind: 'generate',
    instructions: '你是测试助手',
    messages: [
      { role: 'user', content: '第一条需求' },
      { role: 'assistant', content: '上一次输出' },
      { role: 'user', content: '请修正' },
    ],
    temperature: 0.8,
    maxOutputTokens: 1500,
    signal,
  }
}

describe('createDeepSeekClient', () => {
  it('传入指令和消息，开启 JSON 模式并关闭思考', async () => {
    const model = mockModel('{"ok":true}', 11, 22)
    const client = createDeepSeekClient(env, model)
    const request = makeRequest()

    const result = await client.generateJson(request)

    expect(client.mode).toBe('live')
    expect(result).toEqual({
      text: '{"ok":true}',
      usage: { inputTokens: 11, outputTokens: 22 },
    })
    const call = model.doGenerateCalls[0]
    expect(call).toBeDefined()
    expect(call?.prompt).toEqual([
      { role: 'system', content: '你是测试助手' },
      { role: 'user', content: [{ type: 'text', text: '第一条需求' }] },
      { role: 'assistant', content: [{ type: 'text', text: '上一次输出' }] },
      { role: 'user', content: [{ type: 'text', text: '请修正' }] },
    ])
    expect(call?.responseFormat?.type).toBe('json')
    expect(call?.providerOptions).toEqual({ deepseek: { thinking: { type: 'disabled' } } })
    expect(call?.temperature).toBe(0.8)
    expect(call?.maxOutputTokens).toBe(1500)
  })

  it('模型返回非 JSON 文本时交回原文而不抛出', async () => {
    const client = createDeepSeekClient(env, mockModel('这里不是 JSON', 7, 9))
    await expect(client.generateJson(makeRequest())).resolves.toEqual({
      text: '这里不是 JSON',
      usage: { inputTokens: 7, outputTokens: 9 },
    })
  })

  it('usage 缺失时按 0 处理', async () => {
    const client = createDeepSeekClient(env, mockModel('{"ok":true}'))
    const result = await client.generateJson(makeRequest())
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })
})

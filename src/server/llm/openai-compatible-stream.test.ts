import { afterEach, describe, expect, it, vi } from 'vitest'
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider'
import { parseEnv } from '@/server/env-schema'
import { createLiveClient } from './openai-compatible'
import type { AgentLlmRequest, AgentStreamPart } from './types'

const env = parseEnv({
  LLM_MODE: 'live',
  LLM_BASE_URL: 'https://example.invalid/v1',
  LLM_API_KEY: 'unit-test-key',
})

function usage(inputTokens = 5, outputTokens = 7) {
  return {
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
  }
}

function streamResult(chunks: LanguageModelV4StreamPart[]) {
  return { stream: simulateReadableStream({ chunks }) }
}

function textResult(text: string, reasoning?: string) {
  const chunks: LanguageModelV4StreamPart[] = []
  if (reasoning !== undefined) {
    chunks.push(
      { type: 'reasoning-start', id: 'r1' },
      { type: 'reasoning-delta', id: 'r1', delta: reasoning },
      { type: 'reasoning-end', id: 'r1' },
    )
  }
  chunks.push(
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: text },
    { type: 'text-end', id: 't1' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: undefined },
      usage: usage(),
    },
  )
  return streamResult(chunks)
}

function makeRequest(overrides: Partial<AgentLlmRequest> = {}): AgentLlmRequest {
  return {
    instructions: '测试指令',
    messages: [{ role: 'user', content: '测试任务' }],
    tools: [],
    thinking: false,
    maxOutputTokens: 3000,
    signal: new AbortController().signal,
    ...overrides,
  }
}

async function collect(
  model: MockLanguageModelV4,
  request = makeRequest(),
): Promise<AgentStreamPart[]> {
  const client = createLiveClient(env, model)
  const parts: AgentStreamPart[] = []
  for await (const part of client.streamAgent(request)) {
    parts.push(part)
  }
  return parts
}

describe('llm.streamAgent', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('转换纯文本和 finish usage', async () => {
    const model = new MockLanguageModelV4({ doStream: async () => textResult('你好') })
    await expect(collect(model)).resolves.toEqual([
      { type: 'step-start' },
      { type: 'text', delta: '你好' },
      { type: 'finish', usage: { inputTokens: 5, outputTokens: 7 } },
    ])
  })

  it('转换 reasoning 和文本', async () => {
    const model = new MockLanguageModelV4({ doStream: async () => textResult('答案', '先分析') })
    const parts = await collect(model)
    expect(parts).toContainEqual({ type: 'reasoning', delta: '先分析' })
    expect(parts).toContainEqual({ type: 'text', delta: '答案' })
  })

  it('两个 step 中真实执行 datetime 并按顺序发事件', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        streamResult([
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'datetime',
            input: '{"timezone":"UTC"}',
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: undefined },
            usage: usage(),
          },
        ]),
        textResult('已获取时间'),
      ],
    })
    const parts = await collect(model, makeRequest({ tools: ['datetime'] }))

    expect(parts.map((part) => part.type)).toEqual([
      'step-start',
      'tool_call',
      'tool_result',
      'step-start',
      'text',
      'finish',
    ])
    expect(parts[1]).toMatchObject({ callId: 'c1', input: { timezone: 'UTC' } })
    expect(parts[2]).toMatchObject({ callId: 'c1', ok: true })
    if (parts[2]?.type === 'tool_result') {
      expect(parts[2].summary).toMatch(/（UTC）$/)
    }
    expect(parts.at(-1)).toMatchObject({ usage: { inputTokens: 10, outputTokens: 14 } })
  })

  it('thinking 开启时不传 temperature，并设置低推理强度', async () => {
    const model = new MockLanguageModelV4({ doStream: async () => textResult('答案') })
    await collect(model, makeRequest({ thinking: true }))
    const call = model.doStreamCalls[0]
    expect(call?.providerOptions).toEqual({
      llm: { thinking: { type: 'enabled' }, reasoningEffort: 'low' },
    })
    expect(call?.temperature).toBeUndefined()
  })

  it('thinking 关闭时禁用思考并设置 temperature', async () => {
    const model = new MockLanguageModelV4({ doStream: async () => textResult('答案') })
    await collect(model, makeRequest({ thinking: false }))
    const call = model.doStreamCalls[0]
    expect(call?.providerOptions).toEqual({ llm: { thinking: { type: 'disabled' } } })
    expect(call?.temperature).toBe(0.7)
  })

  it('error part 向外抛出且 SDK 不打印错误对象', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const model = new MockLanguageModelV4({
      doStream: async () => streamResult([{ type: 'error', error: new Error('stream failed') }]),
    })

    await expect(collect(model)).rejects.toThrow('stream failed')
    expect(console.error).not.toHaveBeenCalled()
  })
})

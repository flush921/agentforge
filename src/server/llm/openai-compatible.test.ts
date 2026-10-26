import { afterEach, describe, expect, it, vi } from 'vitest'
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider'
import { parseEnv } from '@/server/env-schema'
import { runAgentStep } from '@/server/services/step'
import { makeStepRequest } from '@/test/step'
import { createLiveClient, relayFetch } from './openai-compatible'
import type { AgentLlmRequest, LlmJsonRequest } from './types'

const env = parseEnv({
  LLM_MODE: 'live',
  LLM_BASE_URL: 'https://example.invalid/v1',
  LLM_API_KEY: 'unit-test-key',
})

function mockModel(text: string | string[], inputTokens?: number, outputTokens?: number) {
  const deltas = Array.isArray(text) ? text : [text]
  const chunks: LanguageModelV4StreamPart[] = [
    { type: 'text-start', id: 't1' },
    ...deltas.map((delta): LanguageModelV4StreamPart => ({ type: 'text-delta', id: 't1', delta })),
    { type: 'text-end', id: 't1' },
    {
      type: 'finish',
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
    },
  ]

  return new MockLanguageModelV4({
    doStream: async () => ({ stream: simulateReadableStream({ chunks }) }),
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

describe('createLiveClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('通过 streamText 收集 JSON 文本、usage 和请求参数', async () => {
    const model = mockModel(['{"ok":', 'true}'], 11, 22)
    const client = createLiveClient(env, model)
    const request = makeRequest()

    const result = await client.generateJson(request)

    expect(client.mode).toBe('live')
    expect(result).toEqual({
      text: '{"ok":true}',
      usage: { inputTokens: 11, outputTokens: 22 },
    })
    expect(model.doGenerateCalls).toHaveLength(0)
    expect(model.doStreamCalls).toHaveLength(1)
    const call = model.doStreamCalls[0]
    expect(call?.prompt).toEqual([
      { role: 'system', content: '你是测试助手' },
      { role: 'user', content: [{ type: 'text', text: '第一条需求' }] },
      { role: 'assistant', content: [{ type: 'text', text: '上一次输出' }] },
      { role: 'user', content: [{ type: 'text', text: '请修正' }] },
    ])
    expect(call?.responseFormat?.type).toBe('json')
    expect(call?.providerOptions).toEqual({ llm: { thinking: { type: 'disabled' } } })
    expect(call?.temperature).toBe(0.8)
    expect(call?.maxOutputTokens).toBe(1500)
  })

  it('NoObjectGeneratedError 时交回已收集的原文而不抛出', async () => {
    const client = createLiveClient(env, mockModel('这里不是 JSON', 7, 9))
    await expect(client.generateJson(makeRequest())).resolves.toEqual({
      text: '这里不是 JSON',
      usage: { inputTokens: 7, outputTokens: 9 },
    })
  })

  it('usage 缺失时按 0 处理', async () => {
    const client = createLiveClient(env, mockModel('{"ok":true}'))
    const result = await client.generateJson(makeRequest())
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('generateJson 的其他 error part 向外抛出且 SDK 不打印', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [{ type: 'error', error: new Error('json stream failed') }],
        }),
      }),
    })
    const client = createLiveClient(env, model)

    await expect(client.generateJson(makeRequest())).rejects.toThrow('json stream failed')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('幻觉未知工具名时跳过工具事件并继续第二步', async () => {
    const model = unknownToolModel()
    const client = createLiveClient(env, model)
    const request: AgentLlmRequest = {
      instructions: '测试指令',
      messages: [{ role: 'user', content: '测试任务' }],
      tools: [],
      thinking: false,
      maxOutputTokens: 1000,
      signal: new AbortController().signal,
    }
    const parts = []
    for await (const part of client.streamAgent(request)) {
      parts.push(part)
    }

    expect(parts.some((part) => part.type === 'tool_call' || part.type === 'tool_result')).toBe(
      false,
    )
    expect(parts).toContainEqual({ type: 'text', delta: '已改用文本回答' })
    expect(model.doStreamCalls).toHaveLength(2)
  })

  it('runAgentStep 在未知工具后最终产出 done', async () => {
    const model = unknownToolModel()
    const client = createLiveClient(env, model)
    const events = []
    for await (const event of runAgentStep(
      client,
      makeStepRequest(),
      new AbortController().signal,
    )) {
      events.push(event)
    }

    expect(events.some((event) => event.type === 'tool_call' || event.type === 'tool_result')).toBe(
      false,
    )
    expect(events.at(-1)).toMatchObject({ type: 'done', output: '已改用文本回答' })
    expect(model.doStreamCalls).toHaveLength(2)
  })
})

describe('relayFetch', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('403 带 request illegal 时读取 clone，等待后只重试一次', async () => {
    vi.useFakeTimers()
    const first = new Response('request illegal', { status: 403 })
    const cloneSpy = vi.spyOn(first, 'clone')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const pending = relayFetch('https://example.invalid/v1/chat/completions', { method: 'POST' })
    await vi.runAllTimersAsync()
    const response = await pending

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(cloneSpy).toHaveBeenCalledTimes(1)
    await expect(first.text()).resolves.toBe('request illegal')
  })

  it('403 不带 request illegal 时原样返回且不重试', async () => {
    const first = new Response('forbidden', { status: 403 })
    const fetchMock = vi.fn().mockResolvedValue(first)
    vi.stubGlobal('fetch', fetchMock)

    const response = await relayFetch('https://example.invalid/v1/chat/completions')

    expect(response).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('200 直接返回且不读取 body', async () => {
    const first = new Response('ok', { status: 200 })
    const cloneSpy = vi.spyOn(first, 'clone')
    const fetchMock = vi.fn().mockResolvedValue(first)
    vi.stubGlobal('fetch', fetchMock)

    const response = await relayFetch('https://example.invalid/v1/chat/completions')

    expect(response).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(cloneSpy).not.toHaveBeenCalled()
  })
})

function unknownToolModel() {
  const usage = {
    inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 0, text: 0, reasoning: undefined },
  }
  const steps: LanguageModelV4StreamPart[][] = [
    [
      { type: 'tool-call', toolCallId: 'unknown-1', toolName: 'search_web', input: '{}' },
      {
        type: 'finish',
        finishReason: { unified: 'tool-calls', raw: undefined },
        usage,
      },
    ],
    [
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: '已改用文本回答' },
      { type: 'text-end', id: 't1' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: undefined },
        usage,
      },
    ],
  ]

  return new MockLanguageModelV4({
    doStream: steps.map((chunks) => ({ stream: simulateReadableStream({ chunks }) })),
  })
}

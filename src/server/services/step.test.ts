import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APICallError } from 'ai'
import type { AgentStepRequest, StepEvent } from '@/lib/contracts/api'
import type { Usage } from '@/lib/contracts/common'
import type { AgentStreamPart, LlmClient } from '@/server/llm/types'
import { fakeLlm } from '@/test/fake-llm'
import { makeReviewRequest, makeStepRequest } from '@/test/step'
import { runAgentStep, stripToolMarkup, workerOutputBudget } from './step'

async function collect(
  client: LlmClient,
  req: AgentStepRequest,
  signal = new AbortController().signal,
): Promise<StepEvent[]> {
  const events: StepEvent[] = []
  for await (const event of runAgentStep(client, req, signal)) {
    events.push(event)
  }
  return events
}

function expectTerminal(events: StepEvent[]): void {
  const terminals = events.filter((event) => event.type === 'done' || event.type === 'error')
  expect(terminals).toHaveLength(1)
  expect(events.at(-1)).toBe(terminals[0])
}

function workerStream(): AgentStreamPart[] {
  return [
    { type: 'step-start' },
    { type: 'text', delta: '先调用工具。' },
    { type: 'tool_call', callId: 'c1', tool: 'datetime', input: {} },
    { type: 'tool_result', callId: 'c1', ok: true, summary: '当前时间' },
    { type: 'step-start' },
    { type: 'reasoning', delta: '组织答案' },
    { type: 'text', delta: '最终' },
    { type: 'text', delta: '答案' },
    { type: 'finish', usage: { inputTokens: 10, outputTokens: 20 } },
  ]
}

function apiError(statusCode: number): APICallError {
  return new APICallError({
    message: 'upstream',
    url: 'https://example.invalid',
    requestBodyValues: {},
    statusCode,
    isRetryable: statusCode === 429 || statusCode >= 500,
  })
}

function reviewResult(
  value: { verdict: 'pass' | 'revise'; issues: string[]; summary: string },
  usage: Usage,
) {
  return { text: JSON.stringify(value), usage }
}

describe('runAgentStep 工作节点', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('转发事件，最后一个非空 step 作为 output', async () => {
    const { client } = fakeLlm([], [workerStream()])
    const events = await collect(client, makeStepRequest())

    expect(events).toContainEqual({ type: 'reasoning', delta: '组织答案' })
    expect(events).toContainEqual({
      type: 'tool_result',
      callId: 'c1',
      ok: true,
      summary: '当前时间',
    })
    expect(events.at(-1)).toEqual({
      type: 'done',
      output: '最终答案',
      usage: { inputTokens: 10, outputTokens: 20 },
    })
    expect(events.at(-1)).not.toMatchObject({ output: expect.stringContaining('先调用工具') })
    expectTerminal(events)
  })

  it('disclaimer 只追加到最终节点并计入 output', async () => {
    const disclaimer = '内容仅供健康参考。'
    const req = makeStepRequest({
      assistant: {
        ...makeStepRequest().assistant,
        guardrails: { refuseTopics: [], disclaimer },
      },
    })
    const finalEvents = await collect(fakeLlm([], [workerStream()]).client, req)
    const intermediateEvents = await collect(
      fakeLlm([], [workerStream()]).client,
      makeStepRequest({ ...req, isFinal: false }),
    )
    const delta = `\n\n> ⚠️ ${disclaimer}`

    expect(finalEvents.at(-1)).toMatchObject({ output: `最终答案${delta}` })
    expect(finalEvents.at(-2)).toEqual({ type: 'text', delta })
    expect(intermediateEvents.at(-1)).toMatchObject({ output: '最终答案' })
    expect(intermediateEvents).not.toContainEqual({ type: 'text', delta })
    expectTerminal(finalEvents)
    expectTerminal(intermediateEvents)
  })

  it('所有 step 都没有文本时产出可重试的 upstream_error', async () => {
    const stream: AgentStreamPart[] = [
      { type: 'step-start' },
      { type: 'reasoning', delta: '只有思考' },
      { type: 'finish', usage: { inputTokens: 1, outputTokens: 2 } },
    ]
    const events = await collect(fakeLlm([], [stream]).client, makeStepRequest())

    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'upstream_error' },
      retryable: true,
    })
    expectTerminal(events)
  })

  it.each([
    [429, 'rate_limited', true],
    [401, 'upstream_error', false],
  ] as const)('上游 %s 映射正确', (status, code, retryable) => {
    return (async () => {
      const events = await collect(fakeLlm([], [apiError(status)]).client, makeStepRequest())
      expect(events.at(-1)).toMatchObject({ type: 'error', error: { code }, retryable })
      expectTerminal(events)
    })()
  })

  it('实际工具取交集，并据此决定思考和输出预算', async () => {
    const base = makeStepRequest()
    const noUsableTools = makeStepRequest({
      node: { ...base.node, tools: ['web_search'] },
    })
    const withDatetime = makeStepRequest({
      node: { ...base.node, tools: ['web_search', 'datetime'] },
      isFinal: false,
    })
    const first = fakeLlm([], [workerStream()])
    const second = fakeLlm([], [workerStream()])

    await collect(first.client, noUsableTools)
    await collect(second.client, withDatetime)

    expect(first.streamRequests[0]).toMatchObject({
      tools: [],
      thinking: false,
      maxOutputTokens: 4000,
    })
    expect(second.streamRequests[0]).toMatchObject({
      tools: ['datetime'],
      thinking: true,
      maxOutputTokens: 16000,
    })
  })

  it.each([
    { thinking: true, isFinal: true, expected: 16000 },
    { thinking: true, isFinal: false, expected: 16000 },
    { thinking: false, isFinal: true, expected: 4000 },
    { thinking: false, isFinal: false, expected: 3000 },
  ])(
    'thinking=$thinking、isFinal=$isFinal 时预算为 $expected',
    ({ thinking, isFinal, expected }) => {
      expect(workerOutputBudget(thinking, isFinal)).toBe(expected)
    },
  )

  it('取消后不再产出事件', async () => {
    const controller = new AbortController()
    const { client } = fakeLlm([])
    const cancellable: LlmClient = {
      ...client,
      async *streamAgent() {
        yield { type: 'step-start' }
        yield { type: 'text', delta: '取消前' }
        controller.abort()
        yield { type: 'text', delta: '取消后' }
      },
    }
    const events = await collect(cancellable, makeStepRequest(), controller.signal)

    expect(events).toEqual([{ type: 'text', delta: '取消前' }])
  })
})

describe('runAgentStep 审校节点', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pass 时依次发 text、review、done', async () => {
    const review = { verdict: 'pass' as const, issues: [], summary: '审校通过' }
    const { client, requests } = fakeLlm([
      reviewResult(review, { inputTokens: 2, outputTokens: 3 }),
    ])
    const events = await collect(client, makeReviewRequest())

    expect(events).toEqual([
      { type: 'text', delta: '审校通过' },
      { type: 'review', verdict: 'pass', issues: [] },
      { type: 'done', output: '审校通过', usage: { inputTokens: 2, outputTokens: 3 } },
    ])
    expect(requests[0]).toMatchObject({ kind: 'review', temperature: 0, maxOutputTokens: 600 })
    expectTerminal(events)
  })

  it('revise 时转发修改意见', async () => {
    const review = { verdict: 'revise' as const, issues: ['补充依据'], summary: '需要修改' }
    const events = await collect(fakeLlm([JSON.stringify(review)]).client, makeReviewRequest())

    expect(events[1]).toEqual({ type: 'review', verdict: 'revise', issues: ['补充依据'] })
    expectTerminal(events)
  })

  it('第一次解析失败后回喂原文，重试成功并累计 usage', async () => {
    const review = { verdict: 'pass' as const, issues: [], summary: '重试通过' }
    const { client, requests } = fakeLlm([
      { text: '不是 JSON', usage: { inputTokens: 1, outputTokens: 1 } },
      reviewResult(review, { inputTokens: 2, outputTokens: 3 }),
    ])
    const events = await collect(client, makeReviewRequest())

    expect(requests).toHaveLength(2)
    expect(requests[1]?.messages[1]).toEqual({ role: 'assistant', content: '不是 JSON' })
    expect(requests[1]?.messages[2]?.content).toContain('JSON 解析失败')
    expect(events.at(-1)).toMatchObject({
      output: '重试通过',
      usage: { inputTokens: 3, outputTokens: 4 },
    })
    expectTerminal(events)
  })

  it('两次都失败时按通过处理', async () => {
    const { client, requests } = fakeLlm(['不是 JSON', '{}'])
    const events = await collect(client, makeReviewRequest())

    expect(requests).toHaveLength(2)
    expect(events).toEqual([
      { type: 'text', delta: '审校输出无法解析，已按通过处理' },
      { type: 'review', verdict: 'pass', issues: [] },
      {
        type: 'done',
        output: '审校输出无法解析，已按通过处理',
        usage: { inputTokens: 0, outputTokens: 0 },
      },
    ])
    expectTerminal(events)
  })

  it('审校返回后已取消时不再产出事件', async () => {
    const controller = new AbortController()
    const { client } = fakeLlm([])
    const review = { verdict: 'pass' as const, issues: [], summary: '审校通过' }
    const cancellable: LlmClient = {
      ...client,
      async generateJson() {
        controller.abort()
        return reviewResult(review, { inputTokens: 1, outputTokens: 1 })
      },
    }
    const events = await collect(cancellable, makeReviewRequest(), controller.signal)

    expect(events).toEqual([])
  })
})

describe('stripToolMarkup', () => {
  const leak = [
    '<｜｜DSML｜｜ calls>',
    '<｜｜DSML｜｜ invoke name="calculator">',
    '<｜｜DSML｜｜ parameter name="expression" string="true">(21.3-12.4)/12.4*100</｜｜DSML｜｜ parameter>',
    '</｜｜DSML｜｜ invoke>',
    '</｜｜DSML｜｜ calls>',
  ].join('\n')

  it('正常正文原样返回', () => {
    expect(stripToolMarkup('## 结论\n\n饮品增长 71.77%。')).toBe('## 结论\n\n饮品增长 71.77%。')
  })

  it('去掉混在正文里的工具标记，保留其余内容', () => {
    expect(stripToolMarkup(`## 结论\n\n${leak}\n\n饮品增长 71.77%。`)).toBe(
      '## 结论\n\n饮品增长 71.77%。',
    )
  })

  it('只有工具标记时返回空串', () => {
    expect(stripToolMarkup(`\n\n${leak}\n`)).toBe('')
  })
})

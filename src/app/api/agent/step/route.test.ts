import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiErrorBodySchema, stepEventSchema, type StepEvent } from '@/lib/contracts/api'
import { readNdjson } from '@/lib/stream/ndjson'
import { resetEnvForTests } from '@/server/env'
import { setMockDelayForTests } from '@/server/llm/mock'
import { resetRateLimitForTests } from '@/server/rate-limit'
import { postJson } from '@/test/http'
import { makeReviewRequest, makeStepRequest } from '@/test/step'
import { POST } from './route'

const PATH = '/api/agent/step'

async function readEvents(response: Response): Promise<StepEvent[]> {
  if (response.body === null) {
    throw new Error('响应缺少 body')
  }
  const events: StepEvent[] = []
  for await (const value of readNdjson(response.body)) {
    events.push(stepEventSchema.parse(value))
  }
  return events
}

function expectTerminal(events: StepEvent[]): void {
  const terminals = events.filter((event) => event.type === 'done' || event.type === 'error')
  expect(terminals).toHaveLength(1)
  expect(events.at(-1)).toBe(terminals[0])
}

describe('POST /api/agent/step', () => {
  beforeEach(() => {
    setMockDelayForTests(0)
    resetRateLimitForTests()
  })

  afterEach(() => {
    setMockDelayForTests()
    resetRateLimitForTests()
    resetEnvForTests()
    vi.unstubAllEnvs()
  })

  it('非 JSON 请求返回 400 JSON 而不是流', async () => {
    const response = await POST(postJson(PATH, '{bad'))
    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(apiErrorBodySchema.parse(await response.json()).error.code).toBe('bad_request')
  })

  it('缺少节点返回 400 并包含字段路径', async () => {
    const response = await POST(postJson(PATH, { assistant: makeStepRequest().assistant }))
    expect(response.status).toBe(400)
    expect(apiErrorBodySchema.parse(await response.json()).error.message).toContain('node')
  })

  it('合法工作节点返回 NDJSON，每行通过 schema 且只有一个终止事件', async () => {
    const response = await POST(postJson(PATH, makeStepRequest()))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-accel-buffering')).toBe('no')

    const events = await readEvents(response)
    expect(events.length).toBeGreaterThan(2)
    expect(events.at(-1)?.type).toBe('done')
    expectTerminal(events)
  })

  it('审校节点响应包含 review 事件', async () => {
    const response = await POST(postJson(PATH, makeReviewRequest()))
    const events = await readEvents(response)

    expect(events.map((event) => event.type)).toEqual(['text', 'review', 'done'])
    expect(events[1]).toMatchObject({
      type: 'review',
      verdict: 'revise',
      issues: expect.any(Array),
    })
    expectTerminal(events)
  })

  it('带 datetime 的节点返回真实 tool_call 和 tool_result', async () => {
    const base = makeStepRequest()
    const response = await POST(
      postJson(PATH, { ...base, node: { ...base.node, tools: ['datetime'] } }),
    )
    const events = await readEvents(response)

    expect(events).toContainEqual({
      type: 'tool_call',
      callId: 'mock_datetime_1',
      tool: 'datetime',
      input: { timezone: 'Asia/Shanghai' },
    })
    expect(events).toContainEqual({
      type: 'tool_result',
      callId: 'mock_datetime_1',
      ok: true,
      summary: expect.stringContaining('（Asia/Shanghai）'),
    })
    expectTerminal(events)
  })
})

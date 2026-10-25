import { describe, expect, it } from 'vitest'
import type { StepEvent } from '../contracts/api'
import { validPlans } from '../fixtures/plans'
import { testAssessment, testAssistant } from '@/test/fixtures'
import { makeStepRequest } from '@/test/step'
import { ApiRequestError, createHttpDeps } from './http-deps'

const assessRequest = { assistant: testAssistant, task: '分析任务' }
const planRequest = {
  assistant: testAssistant,
  task: '复杂任务',
  level: 3 as const,
  assessment: testAssessment,
}

async function collect(events: AsyncIterable<StepEvent>): Promise<StepEvent[]> {
  const result: StepEvent[] = []
  for await (const event of events) {
    result.push(event)
  }
  return result
}

describe('createHttpDeps assess / plan', () => {
  it('解析 assess 和 plan 的 2xx 响应', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const path = String(input)
      return path.endsWith('/assess')
        ? Response.json({ assessment: testAssessment })
        : Response.json({ plan: validPlans[3], source: 'planner', attempts: [] })
    }
    const deps = createHttpDeps({ fetchImpl })
    const signal = new AbortController().signal

    await expect(deps.assess(assessRequest, signal)).resolves.toEqual({
      assessment: testAssessment,
    })
    await expect(deps.plan(planRequest, signal)).resolves.toEqual({
      plan: validPlans[3],
      source: 'planner',
      attempts: [],
    })
  })

  it('非 2xx 抛出带 status 和 apiError 的 ApiRequestError', async () => {
    const apiError = { code: 'rate_limited', message: '请求过于频繁，请稍后重试' } as const
    const fetchImpl: typeof fetch = async () => Response.json({ error: apiError }, { status: 429 })
    const deps = createHttpDeps({ fetchImpl })
    const signal = new AbortController().signal

    const assessError = await deps.assess(assessRequest, signal).catch((error: unknown) => error)
    const planError = await deps.plan(planRequest, signal).catch((error: unknown) => error)
    expect(assessError).toBeInstanceOf(ApiRequestError)
    expect(planError).toBeInstanceOf(ApiRequestError)
    expect(assessError).toMatchObject({ status: 429, apiError })
    expect(planError).toMatchObject({ status: 429, apiError })
  })

  it('2xx 响应 schema 不匹配时抛 ApiRequestError', async () => {
    const deps = createHttpDeps({ fetchImpl: async () => Response.json({ assessment: {} }) })
    await expect(deps.assess(assessRequest, new AbortController().signal)).rejects.toMatchObject({
      status: 200,
      apiError: { code: 'internal' },
    })
  })

  it('设置 accessCode 时加入请求头', async () => {
    let captured: RequestInit | undefined
    const fetchImpl: typeof fetch = async (_input, init) => {
      captured = init
      return Response.json({ assessment: testAssessment })
    }
    const deps = createHttpDeps({ accessCode: 'test-access', fetchImpl })
    await deps.assess(assessRequest, new AbortController().signal)

    expect(new Headers(captured?.headers).get('x-access-code')).toBe('test-access')
    expect(new Headers(captured?.headers).get('content-type')).toBe('application/json')
  })
})

describe('createHttpDeps step', () => {
  it('读取正常 NDJSON 流', async () => {
    const body =
      '{"type":"text","delta":"好"}\n' +
      '{"type":"done","output":"好","usage":{"inputTokens":1,"outputTokens":1}}\n'
    const deps = createHttpDeps({ fetchImpl: async () => new Response(body) })
    const events = await collect(deps.step(makeStepRequest(), new AbortController().signal))

    expect(events.map((event) => event.type)).toEqual(['text', 'done'])
  })

  it.each([
    [429, 'rate_limited', true],
    [400, 'bad_request', false],
  ] as const)('非 2xx %s 转成 error 事件', async (status, code, retryable) => {
    const error = {
      code,
      message: code === 'rate_limited' ? '请求过于频繁，请稍后重试' : '请求格式不正确',
    }
    const deps = createHttpDeps({
      fetchImpl: async () => Response.json({ error }, { status }),
    })
    const events = await collect(deps.step(makeStepRequest(), new AbortController().signal))

    expect(events).toEqual([{ type: 'error', error, retryable }])
  })

  it('中间非法 JSON 行产出 internal 并停止后续读取', async () => {
    const body = '{"type":"text","delta":"前"}\nnot-json\n{"type":"text","delta":"后"}\n'
    const deps = createHttpDeps({ fetchImpl: async () => new Response(body) })
    const events = await collect(deps.step(makeStepRequest(), new AbortController().signal))

    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({ type: 'text', delta: '前' })
    expect(events[1]).toMatchObject({
      type: 'error',
      error: { code: 'internal' },
      retryable: false,
    })
  })

  it('事件 schema 不匹配时产出 internal', async () => {
    const deps = createHttpDeps({ fetchImpl: async () => new Response('{"type":"unknown"}\n') })
    const events = await collect(deps.step(makeStepRequest(), new AbortController().signal))

    expect(events).toEqual([
      {
        type: 'error',
        error: { code: 'internal', message: '服务内部错误' },
        retryable: false,
      },
    ])
  })

  it('fetch 网络异常产出可重试的网络错误', async () => {
    const deps = createHttpDeps({
      fetchImpl: async () => {
        throw new TypeError('fetch failed')
      },
    })
    const events = await collect(deps.step(makeStepRequest(), new AbortController().signal))

    expect(events).toEqual([
      {
        type: 'error',
        error: { code: 'upstream_error', message: '网络连接失败' },
        retryable: true,
      },
    ])
  })

  it('AbortError 向上 rethrow', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    const deps = createHttpDeps({
      fetchImpl: async () => {
        throw abort
      },
    })

    await expect(collect(deps.step(makeStepRequest(), new AbortController().signal))).rejects.toBe(
      abort,
    )
  })
})

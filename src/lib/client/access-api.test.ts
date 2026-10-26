import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { testDraft } from '@/test/assistant'
import { testAssessment, testAssistant } from '@/test/fixtures'
import { makeStepRequest } from '@/test/step'
import { createHttpDeps } from '../orchestrator/http-deps'
import { clearAccessCode, getAccessCode, setAccessCode } from './access'
import { generateAssistant } from './api'

const unauthorized = { code: 'unauthorized', message: '访问码错误或缺失' } as const
const assessRequest = { assistant: testAssistant, task: '分析任务' }
const planRequest = {
  assistant: testAssistant,
  task: '复杂任务',
  level: 3 as const,
  assessment: testAssessment,
}

describe('客户端 API 访问码', () => {
  beforeEach(() => {
    clearAccessCode()
  })

  afterEach(() => {
    clearAccessCode()
  })

  it('generate 和 orchestrator 默认读取已保存的访问码', async () => {
    const captured: RequestInit[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      captured.push(init ?? {})
      return String(input).endsWith('/generate')
        ? Response.json({ assistant: testDraft })
        : Response.json({ assessment: testAssessment })
    }
    setAccessCode('stored-code')

    await generateAssistant('学习助手', {
      signal: new AbortController().signal,
      fetchImpl,
    })
    await createHttpDeps({ fetchImpl }).assess(assessRequest, new AbortController().signal)

    expect(captured).toHaveLength(2)
    for (const init of captured) {
      expect(new Headers(init.headers).get('x-access-code')).toBe('stored-code')
    }
  })

  it('generate 收到 401 时清除访问码', async () => {
    setAccessCode('expired-code')
    const request = generateAssistant('学习助手', {
      signal: new AbortController().signal,
      fetchImpl: async () => Response.json({ error: unauthorized }, { status: 401 }),
    })

    await expect(request).rejects.toMatchObject({ status: 401, apiError: unauthorized })
    expect(getAccessCode()).toBeUndefined()
  })

  it.each(['assess', 'plan'] as const)('%s 收到 401 时清除访问码', async (kind) => {
    setAccessCode('expired-code')
    const deps = createHttpDeps({
      fetchImpl: async () => Response.json({ error: unauthorized }, { status: 401 }),
    })
    const signal = new AbortController().signal
    const request =
      kind === 'assess' ? deps.assess(assessRequest, signal) : deps.plan(planRequest, signal)

    await expect(request).rejects.toMatchObject({ status: 401, apiError: unauthorized })
    expect(getAccessCode()).toBeUndefined()
  })

  it('step 收到 401 时返回错误事件并清除访问码', async () => {
    setAccessCode('expired-code')
    const deps = createHttpDeps({
      fetchImpl: async () => Response.json({ error: unauthorized }, { status: 401 }),
    })
    const events = []
    for await (const event of deps.step(makeStepRequest(), new AbortController().signal)) {
      events.push(event)
    }

    expect(events).toEqual([{ type: 'error', error: unauthorized, retryable: false }])
    expect(getAccessCode()).toBeUndefined()
  })
})

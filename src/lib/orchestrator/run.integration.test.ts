import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as agentStep } from '@/app/api/agent/step/route'
import { POST as assess } from '@/app/api/orchestrate/assess/route'
import { POST as plan } from '@/app/api/orchestrate/plan/route'
import type { RunEvent } from '@/lib/contracts/events'
import { setMockDelayForTests } from '@/server/llm/mock'
import { expectConsistent } from '@/test/fake-deps'
import { testAssistant } from '@/test/fixtures'
import { createHttpDeps } from './http-deps'
import { runOrchestration } from './run'

const fetchImpl: typeof fetch = async (input, init) => {
  const url = new URL(String(input))
  const request = new Request(url, init)
  switch (url.pathname) {
    case '/api/orchestrate/assess':
      return assess(request)
    case '/api/orchestrate/plan':
      return plan(request)
    case '/api/agent/step':
      return agentStep(request)
    default:
      throw new Error(`未注册的集成测试路由：${url.pathname}`)
  }
}

async function execute(task: string) {
  const deps = createHttpDeps({ baseUrl: 'http://integration.test', fetchImpl })
  const events: RunEvent[] = []
  const state = await runOrchestration(
    { assistant: testAssistant, task, intensity: 0.5 },
    deps,
    (event) => events.push(event),
    new AbortController().signal,
  )
  expectConsistent(events, state)
  return { events, state }
}

describe('浏览器编排器真实路由集成', () => {
  beforeEach(() => {
    vi.stubEnv('LLM_MODE', 'mock')
    setMockDelayForTests(0)
  })

  afterEach(() => {
    setMockDelayForTests()
    vi.unstubAllEnvs()
  })

  it('寒暄走 L0，单节点完成', async () => {
    const { state } = await execute('你好')

    expect(state).toMatchObject({ level: 0, status: 'completed', degraded: false })
    expect(state.nodeOrder).toEqual(['answer'])
  })

  it('L1 经真实路由执行 datetime 工具', async () => {
    const { events, state } = await execute('查一下今天是星期几，距离元旦还有多少天')

    expect(state).toMatchObject({ level: 1, status: 'completed' })
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'node.tool_call', tool: 'datetime' }),
    )
    expect(events).toContainEqual(expect.objectContaining({ type: 'node.tool_result', ok: true }))
  })

  it('L4 一轮返工后通过复核并交付修订产出', async () => {
    const task = '调研大学生使用 AI 学习工具的现状，写一份带数据和建议的分析报告'
    const { events, state } = await execute(task)

    expect(state).toMatchObject({ level: 4, status: 'completed', degraded: false })
    expect(state.nodeOrder).toEqual([
      'research_a',
      'research_b',
      'analyst',
      'writer',
      'reviewer',
      'writer_r1',
      'reviewer_r1',
    ])
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'node.review', nodeId: 'reviewer', verdict: 'revise' }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'node.review', nodeId: 'reviewer_r1', verdict: 'pass' }),
    )
    expect(state.output).toMatch(/^> 当前为离线演示模式/)
    expect(state.output).toContain('已根据审校意见修订')
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentStepRequest } from '@/lib/contracts/api'
import type { ToolName } from '@/lib/contracts/common'
import { buildReviewPrompt } from '@/server/prompts/step'
import { buildWorkerPrompt } from '@/server/prompts/step'
import { makeReviewRequest, makeStepRequest } from '@/test/step'
import { createMockClient, setMockDelayForTests } from './mock'
import type { AgentLlmRequest, AgentStreamPart, LlmJsonRequest } from './types'

function makeAgentRequest(
  overrides: Partial<AgentStepRequest> = {},
  tools: ToolName[] = [],
): AgentLlmRequest {
  const req = makeStepRequest(overrides)
  const built = buildWorkerPrompt(req, tools)
  return {
    instructions: built.instructions,
    messages: [{ role: 'user', content: built.user }],
    tools,
    thinking: true,
    maxOutputTokens: 6000,
    signal: new AbortController().signal,
  }
}

async function collect(request: AgentLlmRequest): Promise<AgentStreamPart[]> {
  const parts: AgentStreamPart[] = []
  for await (const part of createMockClient().streamAgent(request)) {
    parts.push(part)
  }
  return parts
}

function makeReviewJsonRequest(revision: boolean): LlmJsonRequest {
  const req = makeReviewRequest(
    revision ? { revision: { round: 1, feedback: '补充依据', previousOutput: '上一版' } } : {},
  )
  const built = buildReviewPrompt(req)
  return {
    kind: 'review',
    instructions: built.instructions,
    messages: [{ role: 'user', content: built.user }],
    temperature: 0,
    maxOutputTokens: 600,
    signal: new AbortController().signal,
  }
}

describe('mock.streamAgent 与 review', () => {
  beforeEach(() => {
    setMockDelayForTests(0)
  })

  afterEach(() => {
    setMockDelayForTests()
  })

  it('同样输入产生同样的事件序列', async () => {
    const request = makeAgentRequest()
    expect(await collect(request)).toEqual(await collect(request))
  })

  it('datetime 先执行工具，再在第二个 step 输出正文', async () => {
    const parts = await collect(makeAgentRequest({}, ['datetime']))
    expect(parts.slice(0, 4).map((part) => part.type)).toEqual([
      'step-start',
      'tool_call',
      'tool_result',
      'step-start',
    ])
    expect(parts[1]).toMatchObject({ tool: 'datetime', input: { timezone: 'Asia/Shanghai' } })
    expect(parts[2]).toMatchObject({ ok: true })
    if (parts[2]?.type === 'tool_result') {
      expect(parts[2].summary).toContain('（Asia/Shanghai）')
    }
    expect(parts.at(-1)?.type).toBe('finish')
  })

  it('calculator 先执行真实工具，再在后续 step 输出正文', async () => {
    const parts = await collect(makeAgentRequest({}, ['calculator']))
    expect(parts.slice(0, 4).map((part) => part.type)).toEqual([
      'step-start',
      'tool_call',
      'tool_result',
      'step-start',
    ])
    expect(parts[1]).toMatchObject({
      tool: 'calculator',
      input: { expression: '(128*3*0.85-40)' },
    })
    expect(parts[2]).toMatchObject({
      ok: true,
      summary: '(128*3*0.85-40) = 286.4',
    })
    const output = parts
      .filter((part) => part.type === 'text')
      .map((part) => part.delta)
      .join('')
    expect(output.startsWith('> 当前为离线演示模式，内容由模板生成。')).toBe(true)
  })

  it('中途取消时立即抛 AbortError', async () => {
    setMockDelayForTests(50)
    const controller = new AbortController()
    const request = { ...makeAgentRequest(), signal: controller.signal }
    const iterator = createMockClient().streamAgent(request)[Symbol.asyncIterator]()
    await iterator.next()
    const pending = iterator.next()
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('review 第 0 轮 revise，带 feedback 的第 1 轮 pass', async () => {
    const client = createMockClient()
    const first = await client.generateJson(makeReviewJsonRequest(false))
    const second = await client.generateJson(makeReviewJsonRequest(true))

    expect(JSON.parse(first.text)).toMatchObject({ verdict: 'revise' })
    expect(JSON.parse(first.text).issues).toHaveLength(2)
    expect(JSON.parse(second.text)).toMatchObject({ verdict: 'pass', issues: [] })
  })

  it('thinking 开启时先推 reasoning，最终正文带离线提示', async () => {
    const parts = await collect({ ...makeAgentRequest(), thinking: true })
    expect(parts.filter((part) => part.type === 'reasoning')).toHaveLength(2)
    const output = parts
      .filter((part) => part.type === 'text')
      .map((part) => part.delta)
      .join('')
    expect(output.startsWith('> 当前为离线演示模式，内容由模板生成。')).toBe(true)
    expect(output.length).toBeGreaterThanOrEqual(150)
    expect(output.length).toBeLessThanOrEqual(400)
  })
})

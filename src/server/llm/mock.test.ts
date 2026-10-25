import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assistantDraftSchema } from '@/lib/contracts/assistant'
import { planSchema } from '@/lib/contracts/plan'
import { validatePlan } from '@/lib/orchestrator/validate-plan'
import { buildAssessPrompt } from '@/server/prompts/assess'
import { buildGeneratePrompt } from '@/server/prompts/generate'
import { buildPlanPrompt } from '@/server/prompts/plan'
import { testAssistant, testAssessment } from '@/test/fixtures'
import { createMockClient, setMockDelayForTests } from './mock'
import type { LlmJsonRequest, LlmKind } from './types'

function makeRequest(
  kind: LlmKind,
  instructions: string,
  user: string,
  signal = new AbortController().signal,
): LlmJsonRequest {
  return {
    kind,
    instructions,
    messages: [{ role: 'user', content: user }],
    temperature: 0,
    maxOutputTokens: 1000,
    signal,
  }
}

function generateRequest(prompt: string, signal?: AbortSignal): LlmJsonRequest {
  const built = buildGeneratePrompt(prompt)
  return makeRequest('generate', built.instructions, built.user, signal)
}

describe('createMockClient', () => {
  beforeEach(() => {
    setMockDelayForTests(0)
  })

  afterEach(() => {
    setMockDelayForTests()
  })

  it('同样输入得到完全相同的文本和 usage', async () => {
    const client = createMockClient()
    const request = generateRequest('帮我做一个考研择校顾问')
    const first = await client.generateJson(request)
    const second = await client.generateJson(request)

    expect(second).toEqual(first)
    expect(first.usage).toEqual({
      inputTokens: Math.ceil((request.instructions + request.messages[0]?.content).length / 2),
      outputTokens: Math.ceil(first.text.length / 2),
    })
  })

  it.each([
    ['帮我做一个考研择校顾问', '学业规划'],
    ['帮我管理健康饮食', '健康饮食'],
    ['帮我看销售数据', '数据分析'],
    ['教我写代码', '编程助教'],
    ['陪我随便聊聊', '通用助手'],
  ])('generate：%s 返回对应模板', async (prompt, name) => {
    const result = await createMockClient().generateJson(generateRequest(prompt))
    const assistant = assistantDraftSchema.parse(JSON.parse(result.text))
    expect(assistant.name).toBe(name)
    expect(assistant.name).not.toContain(prompt)
  })

  it('assess：从 task 数据区读取任务并评分', async () => {
    const built = buildAssessPrompt(testAssistant, '查一下今天的日期')
    const result = await createMockClient().generateJson(
      makeRequest('assess', built.instructions, built.user),
    )
    expect(JSON.parse(result.text)).toMatchObject({
      dims: { subtasks: 0, tools: 2, parallel: 0, rigor: 0, length: 0 },
    })
  })

  it.each([2, 3, 4] as const)('plan：L%s 返回通过 validatePlan 的计划', async (level) => {
    const built = buildPlanPrompt(testAssistant, '复杂任务', level, testAssessment, ['datetime'])
    const result = await createMockClient().generateJson(
      makeRequest('plan', built.instructions, built.user),
    )
    const plan = planSchema.parse(JSON.parse(result.text))

    expect(plan.level).toBe(level)
    expect(validatePlan(plan, { level, allowedTools: ['datetime'] })).toEqual([])
    expect(plan.nodes.find((node) => node.role === 'researcher')?.tools).toEqual(['datetime'])
  })

  it('plan：可用工具为空时所有节点都不带工具', async () => {
    const built = buildPlanPrompt(testAssistant, '复杂任务', 3, testAssessment, [])
    const result = await createMockClient().generateJson(
      makeRequest('plan', built.instructions, built.user),
    )
    const plan = planSchema.parse(JSON.parse(result.text))

    expect(plan.nodes.every((node) => node.tools.length === 0)).toBe(true)
    expect(validatePlan(plan, { level: 3, allowedTools: [] })).toEqual([])
  })

  it('已经中止的 signal 立即抛 AbortError', async () => {
    const controller = new AbortController()
    controller.abort()
    const request = generateRequest('测试', controller.signal)

    await expect(createMockClient().generateJson(request)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('延迟期间中止立即抛 AbortError', async () => {
    setMockDelayForTests(1000)
    const controller = new AbortController()
    const promise = createMockClient().generateJson(generateRequest('测试', controller.signal))
    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })
})

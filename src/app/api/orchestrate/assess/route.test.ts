import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiErrorBodySchema, assessResponseSchema } from '@/lib/contracts/api'
import { resetEnvForTests } from '@/server/env'
import { getLlm } from '@/server/llm'
import { setMockDelayForTests } from '@/server/llm/mock'
import { resetRateLimitForTests } from '@/server/rate-limit'
import { testAssistant } from '@/test/fixtures'
import { postJson } from '@/test/http'
import { POST } from './route'

const PATH = '/api/orchestrate/assess'
const ACCESS_CODE = 'unit-test-access-code'
const complexTask = '调研大学生使用 AI 学习工具的现状，写一份带数据和建议的分析报告'

describe('POST /api/orchestrate/assess', () => {
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

  it('合法请求返回 200 和契约响应', async () => {
    const response = await POST(postJson(PATH, { assistant: testAssistant, task: complexTask }))
    expect(response.status).toBe(200)
    const body = assessResponseSchema.parse(await response.json())
    expect(body.assessment.source).toBe('llm')
  })

  it('寒暄任务走规则快速通道', async () => {
    const response = await POST(postJson(PATH, { assistant: testAssistant, task: '你好' }))
    expect(response.status).toBe(200)
    const body = assessResponseSchema.parse(await response.json())
    expect(body.assessment).toMatchObject({ source: 'rule', rationale: '简单寒暄，直接回答' })
  })

  it('请求体不是 JSON 返回 400', async () => {
    const response = await POST(postJson(PATH, '{not json'))
    expect(response.status).toBe(400)
    expect(apiErrorBodySchema.parse(await response.json()).error.code).toBe('bad_request')
  })

  it('缺少 task 返回包含字段路径的 400', async () => {
    const response = await POST(postJson(PATH, { assistant: testAssistant }))
    expect(response.status).toBe(400)
    const body = apiErrorBodySchema.parse(await response.json())
    expect(body.error.message).toContain('task')
  })

  it('body 超过 200000 字符返回 400', async () => {
    const response = await POST(postJson(PATH, 'x'.repeat(200_001)))
    expect(response.status).toBe(400)
    expect(apiErrorBodySchema.parse(await response.json()).error.code).toBe('bad_request')
  })

  it('配置 ACCESS_CODE 时不带请求头返回 401，且完全未调用 LLM', async () => {
    vi.stubEnv('ACCESS_CODE', ACCESS_CODE)
    resetEnvForTests()
    const spy = vi.spyOn(getLlm(), 'generateJson')

    try {
      const response = await POST(postJson(PATH, { assistant: testAssistant, task: complexTask }))

      expect(response.status).toBe(401)
      expect(spy).not.toHaveBeenCalled()
      const text = await response.clone().text()
      const body = apiErrorBodySchema.parse(await response.json())
      expect(body.error.code).toBe('unauthorized')
      expect(text).not.toContain(ACCESS_CODE)
      expect(text).not.toContain(complexTask)
    } finally {
      spy.mockRestore()
    }
  })

  it('配置 ACCESS_CODE 后携带正确请求头放行', async () => {
    vi.stubEnv('ACCESS_CODE', ACCESS_CODE)
    resetEnvForTests()

    const response = await POST(
      postJson(PATH, { assistant: testAssistant, task: '你好' }, { 'x-access-code': ACCESS_CODE }),
    )

    expect(response.status).toBe(200)
  })
})

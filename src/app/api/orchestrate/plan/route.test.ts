import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiErrorBodySchema, planResponseSchema } from '@/lib/contracts/api'
import { validatePlan } from '@/lib/orchestrator/validate-plan'
import { setMockDelayForTests } from '@/server/llm/mock'
import { testAssistant, testAssessment } from '@/test/fixtures'
import { postJson } from '@/test/http'
import { POST } from './route'

const PATH = '/api/orchestrate/plan'
const validRequest = {
  assistant: testAssistant,
  task: '调研两个方向并汇合形成分析报告',
  level: 3,
  assessment: testAssessment,
}

describe('POST /api/orchestrate/plan', () => {
  beforeEach(() => {
    setMockDelayForTests(0)
  })

  afterEach(() => {
    setMockDelayForTests()
  })

  it('合法请求返回 200 和契约响应', async () => {
    const response = await POST(postJson(PATH, validRequest))
    expect(response.status).toBe(200)
    const body = planResponseSchema.parse(await response.json())
    expect(body.source).toBe('planner')
    expect(body.attempts).toEqual([])
    expect(body.plan?.level).toBe(3)
    if (body.plan !== null) {
      expect(validatePlan(body.plan, { level: 3, allowedTools: ['datetime'] })).toEqual([])
    }
  })

  it('请求体不是 JSON 返回 400', async () => {
    const response = await POST(postJson(PATH, '{not json'))
    expect(response.status).toBe(400)
    expect(apiErrorBodySchema.parse(await response.json()).error.code).toBe('bad_request')
  })

  it('缺少 level 返回包含字段路径的 400', async () => {
    const response = await POST(
      postJson(PATH, { assistant: testAssistant, task: '复杂任务', assessment: testAssessment }),
    )
    expect(response.status).toBe(400)
    const body = apiErrorBodySchema.parse(await response.json())
    expect(body.error.message).toContain('level')
  })

  it('body 超过 200000 字符返回 400', async () => {
    const response = await POST(postJson(PATH, 'x'.repeat(200_001)))
    expect(response.status).toBe(400)
    expect(apiErrorBodySchema.parse(await response.json()).error.code).toBe('bad_request')
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiErrorBodySchema, assistantGenerateResponseSchema } from '@/lib/contracts/api'
import { setMockDelayForTests } from '@/server/llm/mock'
import { postJson } from '@/test/http'
import { POST } from './route'

const PATH = '/api/assistant/generate'

describe('POST /api/assistant/generate', () => {
  beforeEach(() => {
    setMockDelayForTests(0)
  })

  afterEach(() => {
    setMockDelayForTests()
  })

  it('合法请求返回 200 和契约响应', async () => {
    const response = await POST(postJson(PATH, { prompt: '帮我做一个考研择校顾问' }))
    expect(response.status).toBe(200)
    const body = assistantGenerateResponseSchema.parse(await response.json())
    expect(body.assistant.name).toBe('学业规划')
  })

  it('请求体不是 JSON 返回 400', async () => {
    const response = await POST(postJson(PATH, '{not json'))
    expect(response.status).toBe(400)
    expect(apiErrorBodySchema.parse(await response.json()).error.code).toBe('bad_request')
  })

  it('缺少 prompt 返回包含字段路径的 400', async () => {
    const response = await POST(postJson(PATH, {}))
    expect(response.status).toBe(400)
    const body = apiErrorBodySchema.parse(await response.json())
    expect(body.error.message).toContain('prompt')
  })

  it('body 超过 200000 字符返回 400', async () => {
    const response = await POST(postJson(PATH, 'x'.repeat(200_001)))
    expect(response.status).toBe(400)
    expect(apiErrorBodySchema.parse(await response.json()).error.code).toBe('bad_request')
  })
})

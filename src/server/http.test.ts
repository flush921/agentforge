import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { readJson } from './http'

const schema = z.object({ name: z.string() })

function fakeRequest(headers: Record<string, string>, text: () => Promise<string>): Request {
  return { headers: new Headers(headers), text } as unknown as Request
}

describe('readJson', () => {
  it('content-length 超过 200000 时直接返回 400，且不读取 body', async () => {
    const text = vi.fn(() => Promise.reject(new Error('body 不应被读取')))
    const request = fakeRequest({ 'content-length': '200001' }, text)

    const result = await readJson(request, schema)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(400)
      const body = await result.response.json()
      expect(body.error.code).toBe('bad_request')
    }
    expect(text).not.toHaveBeenCalled()
  })

  it('没有 content-length 头时按 text 长度检查', async () => {
    const text = vi.fn(() => Promise.resolve('x'.repeat(200_001)))
    const request = fakeRequest({}, text)

    const result = await readJson(request, schema)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(400)
    }
    expect(text).toHaveBeenCalledTimes(1)
  })

  it('content-length 合法时正常读取并解析 JSON', async () => {
    const text = vi.fn(() => Promise.resolve(JSON.stringify({ name: 'ok' })))
    const request = fakeRequest({ 'content-length': '15' }, text)

    const result = await readJson(request, schema)

    expect(result).toEqual({ ok: true, data: { name: 'ok' } })
    expect(text).toHaveBeenCalledTimes(1)
  })
})

import { describe, expect, it } from 'vitest'
import { testDraft } from '@/test/assistant'
import { ApiRequestError } from '../orchestrator/http-deps'
import { generateAssistant } from './api'

describe('generateAssistant', () => {
  it('发送 prompt 并返回经过 schema 校验的草稿', async () => {
    let captured: RequestInit | undefined
    const signal = new AbortController().signal
    const fetchImpl: typeof fetch = async (_input, init) => {
      captured = init
      return Response.json({ assistant: testDraft })
    }

    const result = await generateAssistant('帮我做一个学习助手', { signal, fetchImpl })

    expect(result).toEqual(testDraft)
    expect(captured?.method).toBe('POST')
    expect(captured?.signal).toBe(signal)
    expect(captured?.body).toBe(JSON.stringify({ prompt: '帮我做一个学习助手' }))
    expect(new Headers(captured?.headers).get('content-type')).toBe('application/json')
  })

  it('非 2xx 抛出带原始 API 错误的 ApiRequestError', async () => {
    const apiError = { code: 'rate_limited', message: '请求过于频繁，请稍后重试' } as const
    const error = await generateAssistant('学习助手', {
      signal: new AbortController().signal,
      fetchImpl: async () => Response.json({ error: apiError }, { status: 429 }),
    }).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status: 429, apiError })
  })

  it('非 2xx 的错误体不匹配时回退为 internal', async () => {
    const error = await generateAssistant('学习助手', {
      signal: new AbortController().signal,
      fetchImpl: async () => Response.json({ error: 'invalid' }, { status: 500 }),
    }).catch((reason: unknown) => reason)

    expect(error).toMatchObject({ status: 500, apiError: { code: 'internal' } })
  })

  it('2xx 响应 schema 不匹配时抛 ApiRequestError', async () => {
    const error = await generateAssistant('学习助手', {
      signal: new AbortController().signal,
      fetchImpl: async () => Response.json({ assistant: { name: '缺少字段' } }),
    }).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status: 200, apiError: { code: 'internal' } })
  })

  it('AbortError 保持原对象抛出', async () => {
    const abortError = new DOMException('用户取消', 'AbortError')
    const error = await generateAssistant('学习助手', {
      signal: new AbortController().signal,
      fetchImpl: async () => {
        throw abortError
      },
    }).catch((reason: unknown) => reason)

    expect(error).toBe(abortError)
  })
})

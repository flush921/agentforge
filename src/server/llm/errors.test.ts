import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APICallError, RetryError } from 'ai'
import { toApiError } from './errors'

function apiError(statusCode?: number, isRetryable = false): APICallError {
  return new APICallError({
    message: '包含请求细节的上游错误',
    url: 'https://example.invalid',
    requestBodyValues: {},
    statusCode,
    isRetryable,
  })
}

function neverAborted(): AbortSignal {
  return new AbortController().signal
}

describe('toApiError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('优先映射用户取消', () => {
    const controller = new AbortController()
    controller.abort()
    const result = toApiError(new Error('其他错误'), controller.signal, '/api/test')
    expect(result).toEqual({ error: { code: 'cancelled', message: '请求已取消' }, status: 499 })
    expect(console.error).not.toHaveBeenCalled()
  })

  it('映射超时', () => {
    const result = toApiError(new DOMException('timeout', 'TimeoutError'), neverAborted())
    expect(result).toEqual({ error: { code: 'timeout', message: '模型响应超时' }, status: 504 })
  })

  it('映射 429 限流', () => {
    const result = toApiError(apiError(429, true), neverAborted())
    expect(result).toEqual({
      error: { code: 'rate_limited', message: '请求过于频繁，请稍后重试' },
      status: 429,
    })
  })

  it('解开 RetryError 后映射其中的 429', () => {
    const lastError = apiError(429, true)
    const retryError = new RetryError({
      message: '重试耗尽',
      reason: 'maxRetriesExceeded',
      errors: [lastError],
    })
    expect(toApiError(retryError, neverAborted()).status).toBe(429)
  })

  it.each([401, 403])('%s 鉴权失败映射 502 并记录安全日志', (status) => {
    const result = toApiError(apiError(status), neverAborted(), '/api/test')
    expect(result).toEqual({
      error: { code: 'upstream_error', message: '模型服务暂时不可用' },
      status: 502,
    })
    expect(console.error).toHaveBeenCalledWith(
      '[api] /api/test upstream_error 上游鉴权失败，请检查 DEEPSEEK_API_KEY',
    )
  })

  it.each([500, 503])('上游 %s 映射 502', (status) => {
    expect(toApiError(apiError(status, true), neverAborted())).toMatchObject({
      error: { code: 'upstream_error' },
      status: 502,
    })
  })

  it('无状态码的网络错误映射 502', () => {
    expect(toApiError(apiError(undefined, false), neverAborted())).toMatchObject({
      error: { code: 'upstream_error' },
      status: 502,
    })
  })

  it('其他可重试上游错误映射 502', () => {
    expect(toApiError(apiError(408, true), neverAborted()).status).toBe(502)
  })

  it('两次输出都不合法映射 502', () => {
    expect(toApiError(new Error('invalid_output'), neverAborted())).toMatchObject({
      error: { code: 'upstream_error' },
      status: 502,
    })
  })

  it.each([new Error('unexpected'), apiError(400, false)])('其余错误映射 500', (error) => {
    expect(toApiError(error, neverAborted())).toEqual({
      error: { code: 'internal', message: '服务内部错误' },
      status: 500,
    })
  })

  it('响应和日志不透出上游原始报错', () => {
    const result = toApiError(apiError(500, true), neverAborted(), '/api/test')
    expect(result.error.message).not.toContain('请求细节')
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('请求细节'))
  })
})

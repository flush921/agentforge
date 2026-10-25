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

  it('取消映射为 cancelled 且不可重试', () => {
    const controller = new AbortController()
    controller.abort()
    expect(toApiError(new Error('其他错误'), controller.signal)).toEqual({
      error: { code: 'cancelled', message: '请求已取消' },
      status: 499,
      retryable: false,
    })
    expect(console.error).not.toHaveBeenCalled()
  })

  it('超时映射为 timeout 且可重试', () => {
    expect(toApiError(new DOMException('timeout', 'TimeoutError'), neverAborted())).toEqual({
      error: { code: 'timeout', message: '模型响应超时' },
      status: 504,
      retryable: true,
    })
  })

  it('429 映射为 rate_limited 且可重试', () => {
    expect(toApiError(apiError(429, true), neverAborted())).toEqual({
      error: { code: 'rate_limited', message: '请求过于频繁，请稍后重试' },
      status: 429,
      retryable: true,
    })
  })

  it('解开 RetryError 后映射其中的 429', () => {
    const retryError = new RetryError({
      message: '重试耗尽',
      reason: 'maxRetriesExceeded',
      errors: [apiError(429, true)],
    })
    expect(toApiError(retryError, neverAborted())).toMatchObject({ status: 429, retryable: true })
  })

  it.each([401, 403])('%s 鉴权失败不可重试，日志带状态码', (status) => {
    const result = toApiError(apiError(status), neverAborted(), '/api/test')
    expect(result).toEqual({
      error: { code: 'upstream_error', message: '模型服务暂时不可用' },
      status: 502,
      retryable: false,
    })
    expect(console.error).toHaveBeenCalledWith(
      `[api] /api/test upstream_error 上游鉴权失败（${status}），请检查 DEEPSEEK_API_KEY`,
    )
  })

  it('402 余额不足映射 502、不可重试并记录诊断日志', () => {
    const result = toApiError(apiError(402), neverAborted(), '/api/test')
    expect(result).toMatchObject({
      error: { code: 'upstream_error', message: '模型服务暂时不可用' },
      status: 502,
      retryable: false,
    })
    expect(console.error).toHaveBeenCalledWith(
      '[api] /api/test upstream_error 上游账户余额不足（402）',
    )
  })

  it.each([500, 503])('上游 %s 映射 502 且可重试', (status) => {
    expect(toApiError(apiError(status, true), neverAborted())).toMatchObject({
      error: { code: 'upstream_error' },
      status: 502,
      retryable: true,
    })
  })

  it('无状态码的网络错误映射 502 且可重试', () => {
    expect(toApiError(apiError(undefined, false), neverAborted())).toMatchObject({
      error: { code: 'upstream_error' },
      status: 502,
      retryable: true,
    })
  })

  it.each([400, 408, 422])('其他上游 %s 映射 internal 且日志带状态码', (status) => {
    const result = toApiError(apiError(status, status === 408), neverAborted(), '/api/test')
    expect(result).toEqual({
      error: { code: 'internal', message: '服务内部错误' },
      status: 500,
      retryable: false,
    })
    expect(console.error).toHaveBeenCalledWith(`[api] /api/test internal 上游返回 ${status}`)
  })

  it('无文本产出映射为可重试的 upstream_error', () => {
    expect(toApiError(new Error('no_output'), neverAborted())).toMatchObject({
      error: { code: 'upstream_error' },
      status: 502,
      retryable: true,
    })
  })

  it('两次输出都不合法映射 502 且不按上游故障重试', () => {
    expect(toApiError(new Error('invalid_output'), neverAborted())).toMatchObject({
      error: { code: 'upstream_error' },
      status: 502,
      retryable: false,
    })
  })

  it('未预期错误记录错误类名', () => {
    const result = toApiError(new TypeError('unexpected'), neverAborted(), '/api/test')
    expect(result).toEqual({
      error: { code: 'internal', message: '服务内部错误' },
      status: 500,
      retryable: false,
    })
    expect(console.error).toHaveBeenCalledWith(
      '[api] /api/test internal 未预期的服务端错误（TypeError）',
    )
  })

  it('取不到错误类名时记录 unknown', () => {
    toApiError(null, neverAborted(), '/api/test')
    expect(console.error).toHaveBeenCalledWith(
      '[api] /api/test internal 未预期的服务端错误（unknown）',
    )
  })

  it('响应和日志不透出上游原始报错', () => {
    const result = toApiError(apiError(500, true), neverAborted(), '/api/test')
    expect(result.error.message).not.toContain('请求细节')
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('请求细节'))
  })
})

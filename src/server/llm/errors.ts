import 'server-only'

import { APICallError, RetryError } from 'ai'
import type { ApiError, ErrorCode } from '@/lib/contracts/common'

interface MappedApiError {
  error: ApiError
  status: number
  retryable: boolean
}

function mapped(
  route: string,
  code: ErrorCode,
  status: number,
  message: string,
  logMessage?: string,
  retryable = false,
): MappedApiError {
  if (logMessage !== undefined) {
    console.error(`[api] ${route} ${code} ${logMessage}`)
  }
  return { error: { code, message }, status, retryable }
}

function hasName(error: unknown, name: string): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === name
}

function constructorName(error: unknown): string {
  if ((typeof error !== 'object' || error === null) && typeof error !== 'function') {
    return 'unknown'
  }

  const constructor: unknown = Reflect.get(error, 'constructor')
  return typeof constructor === 'function' && constructor.name.length > 0
    ? constructor.name
    : 'unknown'
}

function relayCode(responseBody: string | undefined): string {
  if (responseBody === undefined) return 'unknown'
  try {
    const parsed: unknown = JSON.parse(responseBody)
    if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) return 'unknown'
    const nested = parsed.error
    if (typeof nested !== 'object' || nested === null || !('code' in nested)) return 'unknown'
    const code = nested.code
    return typeof code === 'string' && /^[a-z_]{1,40}$/.test(code) ? code : 'unknown'
  } catch {
    return 'unknown'
  }
}

function bodyShape(responseBody: string | undefined): 'sse' | 'json' | 'empty' | 'other' {
  const body = (responseBody ?? '').trimStart()
  if (body.length === 0) return 'empty'
  if (body.startsWith('data:')) return 'sse'
  if (body.startsWith('{')) return 'json'
  return 'other'
}

export function toApiError(error: unknown, signal: AbortSignal, route = 'unknown'): MappedApiError {
  if (signal.aborted) {
    return mapped(route, 'cancelled', 499, '请求已取消')
  }

  if (hasName(error, 'TimeoutError')) {
    return mapped(route, 'timeout', 504, '模型响应超时', '模型调用超时', true)
  }

  const unwrapped = RetryError.isInstance(error) ? error.lastError : error

  if (APICallError.isInstance(unwrapped)) {
    const status = unwrapped.statusCode
    const responseBody = unwrapped.responseBody
    if (status === 429) {
      return mapped(
        route,
        'rate_limited',
        429,
        '请求过于频繁，请稍后重试',
        '上游请求限流（429）',
        true,
      )
    }
    if (
      status === 403 &&
      responseBody !== undefined &&
      (responseBody.includes('request illegal') || responseBody.includes('account_restricted'))
    ) {
      return mapped(
        route,
        'upstream_error',
        502,
        '模型服务暂时不可用',
        `上游临时拒绝请求（403 ${relayCode(responseBody)}）`,
        true,
      )
    }
    if (status !== undefined && status >= 200 && status <= 299) {
      return mapped(
        route,
        'upstream_error',
        502,
        '模型服务暂时不可用',
        `上游响应无法解析（${status}，${bodyShape(responseBody)}）`,
        true,
      )
    }
    if (status === 401 || status === 403) {
      return mapped(
        route,
        'upstream_error',
        502,
        '模型服务暂时不可用',
        `上游鉴权失败（${status}），请检查 LLM_API_KEY`,
      )
    }
    if (status === 402) {
      return mapped(route, 'upstream_error', 502, '模型服务暂时不可用', '上游账户余额不足（402）')
    }
    if (status === undefined) {
      return mapped(route, 'upstream_error', 502, '模型服务暂时不可用', '上游网络错误', true)
    }
    if (status >= 500 && status <= 599) {
      return mapped(
        route,
        'upstream_error',
        502,
        '模型服务暂时不可用',
        `上游服务错误（${status}）`,
        true,
      )
    }
    return mapped(route, 'internal', 500, '服务内部错误', `上游返回 ${status}`)
  }

  if (error instanceof Error && error.message === 'no_output') {
    return mapped(route, 'upstream_error', 502, '模型服务暂时不可用', '模型未产生文本', true)
  }

  if (error instanceof Error && error.message === 'invalid_output') {
    return mapped(route, 'upstream_error', 502, '模型服务暂时不可用', '模型输出未通过校验')
  }

  return mapped(
    route,
    'internal',
    500,
    '服务内部错误',
    `未预期的服务端错误（${constructorName(error)}）`,
  )
}

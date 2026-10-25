import 'server-only'

import { APICallError, RetryError } from 'ai'
import type { ApiError, ErrorCode } from '@/lib/contracts/common'

interface MappedApiError {
  error: ApiError
  status: number
}

function mapped(
  route: string,
  code: ErrorCode,
  status: number,
  message: string,
  logMessage?: string,
): MappedApiError {
  if (logMessage !== undefined) {
    console.error(`[api] ${route} ${code} ${logMessage}`)
  }
  return { error: { code, message }, status }
}

function hasName(error: unknown, name: string): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === name
}

export function toApiError(error: unknown, signal: AbortSignal, route = 'unknown'): MappedApiError {
  if (signal.aborted) {
    return mapped(route, 'cancelled', 499, '请求已取消')
  }

  if (hasName(error, 'TimeoutError')) {
    return mapped(route, 'timeout', 504, '模型响应超时', '模型调用超时')
  }

  const unwrapped = RetryError.isInstance(error) ? error.lastError : error

  if (APICallError.isInstance(unwrapped)) {
    const status = unwrapped.statusCode
    if (status === 429) {
      return mapped(route, 'rate_limited', 429, '请求过于频繁，请稍后重试', '上游请求限流')
    }
    if (status === 401 || status === 403) {
      return mapped(
        route,
        'upstream_error',
        502,
        '模型服务暂时不可用',
        '上游鉴权失败，请检查 DEEPSEEK_API_KEY',
      )
    }
    if (status === undefined) {
      return mapped(route, 'upstream_error', 502, '模型服务暂时不可用', '上游网络错误')
    }
    if ((status >= 500 && status <= 599) || unwrapped.isRetryable) {
      return mapped(route, 'upstream_error', 502, '模型服务暂时不可用', '上游服务错误')
    }
  }

  if (error instanceof Error && error.message === 'invalid_output') {
    return mapped(route, 'upstream_error', 502, '模型服务暂时不可用', '模型输出未通过校验')
  }

  return mapped(route, 'internal', 500, '服务内部错误', '未预期的服务端错误')
}

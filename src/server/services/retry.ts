import 'server-only'

import { toApiError } from '@/server/llm/errors'

/** 两次调用之间的等待时间：足够让上游的瞬时抖动过去，又不会让用户明显感到卡顿。 */
export const RETRY_DELAY_MS = 800

export function isCancellation(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
  )
}

export function waitForRetry(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'))
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, RETRY_DELAY_MS)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * 执行一次上游调用；遇到可重试的错误（429、5xx、超时、中转站临时拒绝等）时等待后再试一次。
 * 取消直接向上抛出；不可重试的错误和第二次的错误原样抛出，由调用方决定如何降级。
 * `onRetry` 收到错误码，用于在日志里留下「这次是靠重试才成功」的痕迹。
 */
export async function withTransientRetry<T>(
  call: () => Promise<T>,
  route: string,
  signal: AbortSignal,
  onRetry?: (code: string) => void,
): Promise<T> {
  try {
    return await call()
  } catch (error) {
    // 用户已经取消时，结果就是「取消」，不能把同时到达的上游错误当成模型失败报出去。
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    if (isCancellation(error, signal)) throw error
    const mapped = toApiError(error, signal, route)
    if (!mapped.retryable) throw error
    onRetry?.(mapped.error.code)
    await waitForRetry(signal)
    return call()
  }
}

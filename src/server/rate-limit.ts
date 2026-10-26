import 'server-only'

import { jsonError } from './http'

const WINDOW_MS = 60_000
const MAX_KEYS = 5_000

const RATE_LIMITED_MESSAGE = '请求过于频繁，请稍后重试'

type Bucket = 'generate' | 'run'
type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number }

const LIMITS: Record<Bucket, number> = { generate: 10, run: 90 }

interface Entry {
  count: number
  resetAt: number
}

// 已知限制：计数保存在单实例进程内存中，多实例部署时不能共享。
const table = new Map<string, Entry>()

function storageKey(bucket: Bucket, key: string): string {
  return `${bucket}:${key}`
}

function sweepExpired(now: number): void {
  for (const [id, entry] of table) {
    if (now >= entry.resetAt) {
      table.delete(id)
    }
  }
}

export function checkRateLimit(bucket: Bucket, key: string, now = Date.now()): RateLimitResult {
  if (table.size > MAX_KEYS) {
    sweepExpired(now)
  }

  const id = storageKey(bucket, key)
  const entry = table.get(id)
  if (entry === undefined || now >= entry.resetAt) {
    table.set(id, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true }
  }

  if (entry.count >= LIMITS[bucket]) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) }
  }

  entry.count += 1
  return { ok: true }
}

export function getClientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded === null) {
    return 'local'
  }

  const [first = ''] = forwarded.split(',')
  if (first.trim() === '') {
    return 'local'
  }

  return first.trim().slice(0, 64)
}

export function rateLimitedResponse(retryAfterSec: number): Response {
  const response = jsonError({ code: 'rate_limited', message: RATE_LIMITED_MESSAGE }, 429)
  response.headers.set('retry-after', String(retryAfterSec))
  return response
}

export function resetRateLimitForTests(): void {
  table.clear()
}

export function rateLimitKeyCountForTests(): number {
  return table.size
}

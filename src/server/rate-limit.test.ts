import { beforeEach, describe, expect, it } from 'vitest'
import {
  checkRateLimit,
  getClientKey,
  rateLimitKeyCountForTests,
  resetRateLimitForTests,
} from './rate-limit'

const PATH = '/api/agent/step'

function requestWithXff(value: string | null): Request {
  const headers = new Headers()
  if (value !== null) {
    headers.set('x-forwarded-for', value)
  }
  return new Request(`http://localhost${PATH}`, { method: 'POST', headers })
}

describe('checkRateLimit', () => {
  beforeEach(() => {
    resetRateLimitForTests()
  })

  it('窗口内计数到上限后拒绝并给出 retryAfterSec', () => {
    const now = 1_000_000
    for (let i = 0; i < 10; i += 1) {
      expect(checkRateLimit('generate', 'client-a', now)).toEqual({ ok: true })
    }

    const limited = checkRateLimit('generate', 'client-a', now)
    expect(limited.ok).toBe(false)
    if (!limited.ok) {
      expect(limited.retryAfterSec).toBe(60)
    }
  })

  it('窗口过期后计数重置', () => {
    const now = 2_000_000
    for (let i = 0; i < 10; i += 1) {
      expect(checkRateLimit('generate', 'client-a', now)).toEqual({ ok: true })
    }
    expect(checkRateLimit('generate', 'client-a', now + 60_000).ok).toBe(true)
  })

  it('两个 bucket 相互独立', () => {
    const now = 3_000_000
    for (let i = 0; i < 10; i += 1) {
      checkRateLimit('generate', 'client-a', now)
    }
    expect(checkRateLimit('generate', 'client-a', now).ok).toBe(false)
    expect(checkRateLimit('run', 'client-a', now).ok).toBe(true)
  })

  it('不同 client key 相互独立', () => {
    const now = 4_000_000
    for (let i = 0; i < 10; i += 1) {
      checkRateLimit('generate', 'client-a', now)
    }
    expect(checkRateLimit('generate', 'client-a', now).ok).toBe(false)
    expect(checkRateLimit('generate', 'client-b', now).ok).toBe(true)
  })

  it('retryAfterSec 随时间推移递减', () => {
    const now = 5_000_000
    for (let i = 0; i < 10; i += 1) {
      checkRateLimit('generate', 'client-a', now)
    }
    const limited = checkRateLimit('generate', 'client-a', now + 25_000)
    expect(limited.ok).toBe(false)
    if (!limited.ok) {
      expect(limited.retryAfterSec).toBe(35)
    }
  })

  it('key 超过 5000 时清理已过期的窗口', () => {
    const now = 6_000_000
    for (let i = 0; i < 5_001; i += 1) {
      checkRateLimit('run', `client-${i}`, now)
    }
    expect(rateLimitKeyCountForTests()).toBe(5_001)

    checkRateLimit('run', 'fresh-client', now + 60_000)
    expect(rateLimitKeyCountForTests()).toBe(1)
  })
})

describe('getClientKey', () => {
  it('没有 x-forwarded-for 时返回 local', () => {
    expect(getClientKey(requestWithXff(null))).toBe('local')
  })

  it('取 x-forwarded-for 第一段并 trim', () => {
    expect(getClientKey(requestWithXff('  203.0.113.1 , 10.0.0.1'))).toBe('203.0.113.1')
  })

  it('第一段为空时返回 local', () => {
    expect(getClientKey(requestWithXff('   , 10.0.0.1'))).toBe('local')
    expect(getClientKey(requestWithXff(''))).toBe('local')
  })

  it('最长截取 64 个字符', () => {
    expect(getClientKey(requestWithXff('a'.repeat(100)))).toBe('a'.repeat(64))
  })
})

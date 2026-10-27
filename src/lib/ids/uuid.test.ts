import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId } from './uuid'

const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('生成符合 RFC 4122 的 v4 ID', () => {
    expect(newId()).toMatch(uuidV4Pattern)
  })

  it('原生 UUID 方法不可用时使用 getRandomValues', () => {
    const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
    vi.stubGlobal('crypto', { getRandomValues })

    expect(newId()).toMatch(uuidV4Pattern)
  })

  it('生成 1000 个 ID 不重复', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()))

    expect(ids.size).toBe(1000)
  })
})

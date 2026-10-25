import { describe, expect, it } from 'vitest'
import { getLlm } from './index'

describe('getLlm', () => {
  it('默认使用 mock 并缓存实例', () => {
    const first = getLlm()
    expect(first.mode).toBe('mock')
    expect(getLlm()).toBe(first)
  })
})

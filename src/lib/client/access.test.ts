import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACCESS_REQUIRED_EVENT,
  clearAccessCode,
  getAccessCode,
  reportAccessRequired,
  setAccessCode,
} from './access'

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key) {
      return values.get(key) ?? null
    },
    key(index) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }
}

describe('客户端访问码存储', () => {
  beforeEach(() => {
    clearAccessCode()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearAccessCode()
  })

  it('使用 sessionStorage 读写和清除', () => {
    const sessionStorage = createStorage()
    vi.stubGlobal('window', { sessionStorage })

    setAccessCode('demo-code')
    expect(getAccessCode()).toBe('demo-code')
    expect(sessionStorage.getItem('agentforge.accessCode')).toBe('demo-code')

    clearAccessCode()
    expect(getAccessCode()).toBeUndefined()
    expect(sessionStorage.getItem('agentforge.accessCode')).toBeNull()
  })

  it('sessionStorage 不可用时退回内存', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem() {
          throw new Error('storage denied')
        },
        setItem() {
          throw new Error('storage denied')
        },
        removeItem() {
          throw new Error('storage denied')
        },
      },
    })

    setAccessCode('memory-code')
    expect(getAccessCode()).toBe('memory-code')
    clearAccessCode()
    expect(getAccessCode()).toBeUndefined()
  })

  it('401 通知清除访问码并广播重新验证事件', () => {
    const events = new EventTarget()
    const sessionStorage = createStorage()
    vi.stubGlobal('window', Object.assign(events, { sessionStorage }))
    const listener = vi.fn()
    window.addEventListener(ACCESS_REQUIRED_EVENT, listener)
    setAccessCode('expired-code')

    reportAccessRequired()

    expect(getAccessCode()).toBeUndefined()
    expect(listener).toHaveBeenCalledOnce()
  })
})

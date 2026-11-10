import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTourStore } from './tour-store'

const KEY = 'agentforge.tour'

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

let sessionStorage: Storage

beforeEach(() => {
  sessionStorage = createStorage()
  vi.stubGlobal('window', { sessionStorage })
  useTourStore.setState({ status: 'idle', step: 'welcome' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('新手教程进度', () => {
  it('这个标签页第一次进站时从欢迎开始', () => {
    useTourStore.getState().autoStart()

    expect(useTourStore.getState()).toMatchObject({ status: 'active', step: 'welcome' })
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({ status: 'active', step: 'welcome' })
  })

  it('刷新页面后接着上次的步骤', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ status: 'active', step: 'node' }))

    useTourStore.getState().autoStart()

    expect(useTourStore.getState()).toMatchObject({ status: 'active', step: 'node' })
  })

  it('同一个标签页里看完或跳过后不再自动弹出', () => {
    useTourStore.getState().autoStart()
    useTourStore.getState().finish()
    useTourStore.setState({ status: 'idle', step: 'welcome' })

    useTourStore.getState().autoStart()

    expect(useTourStore.getState().status).toBe('done')
  })

  it('新开标签页（没有记录）时教程重新出现', () => {
    useTourStore.getState().autoStart()
    useTourStore.getState().finish()
    // 新标签页有自己的 sessionStorage，页面状态也是全新的。
    vi.stubGlobal('window', { sessionStorage: createStorage() })
    useTourStore.setState({ status: 'idle', step: 'welcome' })

    useTourStore.getState().autoStart()

    expect(useTourStore.getState()).toMatchObject({ status: 'active', step: 'welcome' })
  })

  it('已经在进行中时 autoStart 不会重置进度', () => {
    useTourStore.getState().start()
    useTourStore.getState().goTo('canvas')

    useTourStore.getState().autoStart()

    expect(useTourStore.getState().step).toBe('canvas')
  })

  it('next 逐步前进，最后一步之后结束', () => {
    useTourStore.getState().start()
    useTourStore.getState().next()
    expect(useTourStore.getState().step).toBe('generate')

    useTourStore.getState().goTo('finish')
    useTourStore.getState().next()

    expect(useTourStore.getState().status).toBe('done')
    expect(JSON.parse(sessionStorage.getItem(KEY)!).status).toBe('done')
  })

  it('「新手教程」按钮在看完之后也能从头再来', () => {
    useTourStore.getState().start()
    useTourStore.getState().finish()

    useTourStore.getState().start()

    expect(useTourStore.getState()).toMatchObject({ status: 'active', step: 'welcome' })
  })

  it('教程没在进行时 goTo 不生效', () => {
    useTourStore.getState().goTo('node')

    expect(useTourStore.getState()).toMatchObject({ status: 'idle', step: 'welcome' })
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('存储内容损坏或不可用时按没看过处理', () => {
    sessionStorage.setItem(KEY, '{"status":"active","step":"不存在的步骤"}')
    useTourStore.getState().autoStart()
    expect(useTourStore.getState()).toMatchObject({ status: 'active', step: 'welcome' })

    vi.stubGlobal('window', {
      get sessionStorage(): Storage {
        throw new Error('storage denied')
      },
    })
    useTourStore.setState({ status: 'idle', step: 'welcome' })
    useTourStore.getState().autoStart()
    expect(useTourStore.getState()).toMatchObject({ status: 'active', step: 'welcome' })
  })
})

import { create } from 'zustand'
import { isTourStepId, nextTourStep, type TourStepId } from '@/lib/tour/steps'

const STORAGE_KEY = 'agentforge.tour'

export type TourStatus = 'idle' | 'active' | 'done'

interface SavedTour {
  status: 'active' | 'done'
  step: TourStepId
}

/**
 * 进度存在 sessionStorage：和访问码一样只在当前标签页有效。
 * 换一个人重新打开网站（新标签页）时没有记录，教程会重新出现；
 * 同一个标签页里看完或跳过后不再自动弹出，刷新页面也能接着上次的步骤。
 */
function sessionStore(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function readSaved(): SavedTour | undefined {
  try {
    const raw = sessionStore()?.getItem(STORAGE_KEY)
    if (raw === null || raw === undefined) return undefined
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return undefined
    const status: unknown = Reflect.get(value, 'status')
    const step: unknown = Reflect.get(value, 'step')
    if ((status === 'active' || status === 'done') && isTourStepId(step)) {
      return { status, step }
    }
  } catch {
    // 存储不可用或内容损坏时按「没看过」处理。
  }
  return undefined
}

function save(value: SavedTour): void {
  try {
    sessionStore()?.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // 存不进去只影响刷新后的恢复，不影响当前页面。
  }
}

export interface TourStore {
  status: TourStatus
  step: TourStepId
  /** 进入站点（访问码通过）后调用：这个标签页还没出现过教程就从头开始，否则恢复上次的进度。 */
  autoStart: () => void
  /** 「新手教程」按钮：随时从头再看一遍。 */
  start: () => void
  goTo: (step: TourStepId) => void
  next: () => void
  /** 看完或跳过。 */
  finish: () => void
}

export const useTourStore = create<TourStore>()((set, get) => ({
  status: 'idle',
  step: 'welcome',
  autoStart() {
    if (get().status !== 'idle') return
    const saved = readSaved()
    if (saved !== undefined) {
      set(saved)
      return
    }
    get().start()
  },
  start() {
    const value: SavedTour = { status: 'active', step: 'welcome' }
    save(value)
    set(value)
  },
  goTo(step) {
    if (get().status !== 'active') return
    save({ status: 'active', step })
    set({ step })
  },
  next() {
    const following = nextTourStep(get().step)
    if (following === null) {
      get().finish()
    } else {
      get().goTo(following)
    }
  },
  finish() {
    const value: SavedTour = { status: 'done', step: get().step }
    save(value)
    set({ status: 'done' })
  },
}))

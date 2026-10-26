import type { RunEvent } from '../contracts/events'
import { applyEvent, initialRunState } from './reducer'
import type { RunState } from './types'

export interface ReplayCursor {
  state: RunState
  /** 下一个尚未应用的事件下标 */
  index: number
}

/**
 * 从 cursor.index 开始，依次 apply 所有 `e.t <= t` 的事件。
 * 往回拖（t 变小）时不会回退，由调用方从头重算。
 */
export function advanceReplay(
  cursor: ReplayCursor,
  events: readonly RunEvent[],
  t: number,
): ReplayCursor {
  let state = cursor.state
  let index = cursor.index
  for (; index < events.length; index += 1) {
    const event = events[index]!
    if (event.t > t) {
      break
    }
    state = applyEvent(state, event)
  }
  return { state, index }
}

export function initialCursor(): ReplayCursor {
  return { state: initialRunState(), index: 0 }
}

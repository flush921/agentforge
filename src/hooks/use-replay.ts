'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RunEvent } from '../lib/contracts/events'
import { advanceReplay } from '../lib/run/replay'
import { applyEvent, initialRunState } from '../lib/run/reducer'
import type { ReplayCursor } from '../lib/run/replay'
import type { RunState } from '../lib/run/types'

export interface UseReplayOptions {
  /** 初始时刻，用于 ?t= 冻结截图 */
  initialT?: number
  /** 默认 true；为 false 时不会自动播放 */
  autoplay?: boolean
}

export interface UseReplayResult {
  state: RunState
  t: number
  duration: number
  playing: boolean
  speed: number
  play: () => void
  pause: () => void
  seek: (t: number) => void
  setSpeed: (speed: number) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 从头重算到时刻 t（用于初始化和 seek 回退）。 */
function replayFromStart(events: readonly RunEvent[], t: number): ReplayCursor {
  let state = initialRunState()
  let index = 0
  for (; index < events.length; index += 1) {
    const event = events[index]!
    if (event.t > t) {
      break
    }
    state = applyEvent(state, event)
  }
  return { state, index }
}

export function useReplay(
  events: readonly RunEvent[],
  { initialT = 0, autoplay = true }: UseReplayOptions = {},
): UseReplayResult {
  const lastEvent = events[events.length - 1]
  const duration = lastEvent ? lastEvent.t : 0

  const [t, setT] = useState(() => clamp(initialT, 0, duration))
  const [playing, setPlaying] = useState(autoplay)
  const [speed, setSpeed] = useState(1)
  const [cursor, setCursor] = useState<ReplayCursor>(() =>
    replayFromStart(events, clamp(initialT, 0, duration)),
  )

  const tRef = useRef(t)
  const speedRef = useRef(speed)
  const cursorRef = useRef(cursor)

  // 把最新状态镜像到 ref，供 rAF 回调和事件处理函数读取。
  useEffect(() => {
    tRef.current = t
    speedRef.current = speed
    cursorRef.current = cursor
  }, [t, speed, cursor])

  // 事件列表切换：在当前时刻（钳制到新时长内）从头重算。
  useEffect(() => {
    const clamped = clamp(tRef.current, 0, duration)
    const fresh = replayFromStart(events, clamped)
    cursorRef.current = fresh
    setCursor(fresh)
    tRef.current = clamped
    setT(clamped)
    if (clamped >= duration) {
      setPlaying(false)
    }
  }, [events, duration])

  // rAF 推进：t += dt * speed，到结尾自动暂停。
  useEffect(() => {
    if (!playing) {
      return
    }
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = now - last
      last = now
      const next = Math.min(tRef.current + dt * speedRef.current, duration)
      if (next > tRef.current) {
        const advanced = advanceReplay(cursorRef.current, events, next)
        cursorRef.current = advanced
        setCursor(advanced)
        tRef.current = next
        setT(next)
      }
      if (next >= duration) {
        setPlaying(false)
        return
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, events, duration])

  const play = useCallback(() => {
    if (tRef.current >= duration) {
      const fresh = replayFromStart(events, 0)
      cursorRef.current = fresh
      setCursor(fresh)
      tRef.current = 0
      setT(0)
    }
    setPlaying(true)
  }, [events, duration])

  const pause = useCallback(() => setPlaying(false), [])

  const seek = useCallback(
    (target: number) => {
      const clamped = clamp(target, 0, duration)
      const next =
        clamped < tRef.current
          ? replayFromStart(events, clamped)
          : advanceReplay(cursorRef.current, events, clamped)
      cursorRef.current = next
      setCursor(next)
      tRef.current = clamped
      setT(clamped)
      if (clamped >= duration) {
        setPlaying(false)
      }
    },
    [events, duration],
  )

  const setSpeedAndClamp = useCallback((value: number) => {
    setSpeed(clamp(value, 0.1, 16))
  }, [])

  return {
    state: cursor.state,
    t,
    duration,
    playing,
    speed,
    play,
    pause,
    seek,
    setSpeed: setSpeedAndClamp,
  }
}

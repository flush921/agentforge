'use client'

import { useEffect } from 'react'

/**
 * 给页面上所有 `.spotlight` 元素提供鼠标位置变量 `--mx` / `--my`，
 * 由 CSS 画出跟随光标的边框高光。只用一个文档级监听，不给每张卡片挂事件。
 */
export function Spotlight() {
  useEffect(() => {
    let frame = 0
    let last: PointerEvent | null = null

    function apply() {
      frame = 0
      if (last === null) return
      const target = last.target instanceof Element ? last.target.closest('.spotlight') : null
      if (!(target instanceof HTMLElement)) return
      const rect = target.getBoundingClientRect()
      target.style.setProperty('--mx', `${last.clientX - rect.left}px`)
      target.style.setProperty('--my', `${last.clientY - rect.top}px`)
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerType === 'touch') return
      last = event
      if (frame === 0) frame = requestAnimationFrame(apply)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [])

  return null
}

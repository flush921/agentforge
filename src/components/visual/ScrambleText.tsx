'use client'

import { useEffect, useState } from 'react'

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/#*+'

/**
 * 「解码」入场：字符先随机跳动，再从左到右依次定格为真实文字。
 * 屏幕阅读器只读取真实文字；减少动效时直接显示。
 */
export function ScrambleText({
  text,
  className,
  delay = 200,
}: {
  text: string
  className?: string
  delay?: number
}) {
  const [shown, setShown] = useState(text)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    let start = 0
    const settleMs = 70
    const total = delay + text.length * settleMs + 260

    function tick(now: number) {
      if (start === 0) start = now
      const elapsed = now - start
      if (elapsed >= total) {
        setShown(text)
        return
      }
      const settled = Math.max(0, Math.floor((elapsed - delay - 260) / settleMs))
      setShown(
        [...text]
          .map((char, index) =>
            index < settled || char === ' '
              ? char
              : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
          )
          .join(''),
      )
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [delay, text])

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>{shown}</span>
    </span>
  )
}

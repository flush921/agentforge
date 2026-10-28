'use client'

import { useEffect, useRef } from 'react'
import { BASE_LAYER_CLASS, CURSOR_LAYER_CLASS, fitLayers, getLayer } from './canvas-layers'

/**
 * 极光点阵：鼠标附近的点会变亮、放大并被轻轻推开；点击处扩散一圈涟漪。
 * `ambient` 打开时还有一道缓慢流动的光带（首页使用）。
 * 被光标点亮的点画在光标层，移到面板上也能看到；只在有动画需要时运行 rAF。
 */

const GAP = 26
const REACH = 170
const PUSH = 7
const BRAND = [34, 211, 238] as const
const BASE = [96, 125, 140] as const
const RIPPLE_MS = 1400
const RIPPLE_SPEED = 0.62
const ALPHA_STEPS = 8

interface Ripple {
  x: number
  y: number
  start: number
}

export function DotField({ ambient = false }: { ambient?: boolean }) {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const cursorRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const base = getLayer(baseRef.current)
    const cursor = getLayer(cursorRef.current)
    if (!base || !cursor) return
    const ctx = base.ctx
    const top = cursor.ctx
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let width = 0
    let height = 0
    let frame = 0
    let running = false
    let lastActive = 0
    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, inside: false }
    const ripples: Ripple[] = []

    function resize() {
      ;({ width, height } = fitLayers([base!, cursor!]))
    }

    function draw(now: number) {
      ctx.clearRect(0, 0, width, height)
      top.clearRect(0, 0, width, height)
      const reduced = motionQuery.matches
      // 光标位置做缓动，让高亮区域带一点拖尾。
      pointer.x += (pointer.tx - pointer.x) * 0.16
      pointer.y += (pointer.ty - pointer.y) * 0.16
      while (ripples.length > 0 && now - ripples[0]!.start > RIPPLE_MS) ripples.shift()

      const buckets: Path2D[] = Array.from({ length: ALPHA_STEPS }, () => new Path2D())
      const glows: Array<{ x: number; y: number; r: number; t: number; cursor: boolean }> = []
      const offsetX = (width % GAP) / 2
      const offsetY = (height % GAP) / 2

      for (let gy = offsetY; gy < height + GAP; gy += GAP) {
        for (let gx = offsetX; gx < width + GAP; gx += GAP) {
          let x = gx
          let y = gy
          let heat = 0
          if (!reduced && pointer.inside) {
            const dx = gx - pointer.x
            const dy = gy - pointer.y
            const distance = Math.hypot(dx, dy)
            if (distance < REACH) {
              const t = 1 - distance / REACH
              heat = t * t
              const push = (PUSH * heat) / Math.max(distance, 1)
              x += dx * push
              y += dy * push
            }
          }
          for (const ripple of ripples) {
            const radius = (now - ripple.start) * RIPPLE_SPEED
            const band = Math.abs(Math.hypot(gx - ripple.x, gy - ripple.y) - radius)
            if (band < 36) {
              const fade = 1 - (now - ripple.start) / RIPPLE_MS
              heat = Math.max(heat, (1 - band / 36) * fade * 0.9)
            }
          }
          let shimmer = 0
          if (ambient && !reduced) {
            const wave = Math.sin(gx * 0.011 + gy * 0.007 - now * 0.00055)
            shimmer = Math.max(0, wave) ** 6 * 0.33
          }
          const level = Math.max(heat, shimmer)
          if (level > 0.18) {
            glows.push({ x, y, r: 1 + level * 2.2, t: level, cursor: heat >= shimmer })
          } else {
            const bucket = Math.min(ALPHA_STEPS - 1, Math.floor((level / 0.18) * ALPHA_STEPS))
            buckets[bucket]!.rect(x - 0.8, y - 0.8, 1.6, 1.6)
          }
        }
      }

      for (let i = 0; i < ALPHA_STEPS; i += 1) {
        const t = i / ALPHA_STEPS
        const r = Math.round(BASE[0] + (BRAND[0] - BASE[0]) * t)
        const g = Math.round(BASE[1] + (BRAND[1] - BASE[1]) * t)
        const b = Math.round(BASE[2] + (BRAND[2] - BASE[2]) * t)
        ctx.fillStyle = `rgba(${r},${g},${b},${0.2 + t * 0.35})`
        ctx.fill(buckets[i]!)
      }
      for (const glow of glows) {
        // 光标层的点略淡一些，叠在文字上也不影响阅读。
        const layer = glow.cursor ? top : ctx
        const alpha = Math.min(1, 0.35 + glow.t * 0.75) * (glow.cursor ? 0.8 : 1)
        layer.fillStyle = `rgba(${BRAND[0]},${BRAND[1]},${BRAND[2]},${alpha})`
        layer.beginPath()
        layer.arc(glow.x, glow.y, glow.r, 0, Math.PI * 2)
        layer.fill()
      }

      const settling =
        Math.abs(pointer.tx - pointer.x) > 0.5 || Math.abs(pointer.ty - pointer.y) > 0.5
      const busy = (ambient && !reduced) || ripples.length > 0 || settling || now - lastActive < 400
      if (busy && !document.hidden) {
        frame = requestAnimationFrame(draw)
      } else {
        running = false
      }
    }

    function wake() {
      lastActive = performance.now()
      if (running || document.hidden) return
      running = true
      frame = requestAnimationFrame(draw)
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerType === 'touch') return
      if (!pointer.inside) {
        pointer.x = event.clientX
        pointer.y = event.clientY
      }
      pointer.tx = event.clientX
      pointer.ty = event.clientY
      pointer.inside = true
      wake()
    }

    function onPointerLeave() {
      pointer.inside = false
      wake()
    }

    function onPointerDown(event: PointerEvent) {
      if (motionQuery.matches) return
      ripples.push({ x: event.clientX, y: event.clientY, start: performance.now() })
      if (ripples.length > 4) ripples.shift()
      wake()
    }

    function onResize() {
      resize()
      wake()
    }

    resize()
    wake()
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('visibilitychange', wake)
    motionQuery.addEventListener('change', wake)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', wake)
      motionQuery.removeEventListener('change', wake)
    }
  }, [ambient])

  return (
    <>
      <canvas ref={baseRef} aria-hidden className={BASE_LAYER_CLASS} />
      <canvas ref={cursorRef} aria-hidden className={CURSOR_LAYER_CLASS} />
    </>
  )
}

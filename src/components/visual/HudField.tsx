'use client'

import { useEffect, useRef } from 'react'
import { BASE_LAYER_CLASS, CURSOR_LAYER_CLASS, fitLayers, getLayer } from './canvas-layers'
import { readCssColor, withAlpha } from './use-theme'

/**
 * 指挥舱背景：网格交点画成「+」刻度，一条扫描线自上而下缓慢扫过（底层）；
 * 光标附近的刻度点亮，光标处画十字准星、旋转瞄准环与坐标读数（光标层，面板上方也可见）。
 */

const CELL = 44
const REACH = 210
const SCAN_MS = 7000

function tick(path: Path2D | CanvasRenderingContext2D, x: number, y: number, arm: number) {
  path.moveTo(x - arm, y)
  path.lineTo(x + arm, y)
  path.moveTo(x, y - arm)
  path.lineTo(x, y + arm)
}

export function HudField() {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const cursorRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const base = getLayer(baseRef.current)
    const cursor = getLayer(cursorRef.current)
    if (!base || !cursor) return
    const ctx = base.ctx
    const top = cursor.ctx
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const brand = readCssColor('--brand', '#c6ff3d')
    const ink = readCssColor('--ink-muted', '#5c6e5b')
    let width = 0
    let height = 0
    let frame = 0
    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, inside: false }
    let lockAt = 0

    function resize() {
      ;({ width, height } = fitLayers([base!, cursor!]))
    }

    function draw(now: number) {
      const reduced = motionQuery.matches
      ctx.clearRect(0, 0, width, height)
      top.clearRect(0, 0, width, height)
      pointer.x += (pointer.tx - pointer.x) * 0.22
      pointer.y += (pointer.ty - pointer.y) * 0.22
      const offsetX = (width % CELL) / 2
      const offsetY = (height % CELL) / 2
      const scanY = reduced ? -1 : ((now % SCAN_MS) / SCAN_MS) * (height + 200) - 100
      const tracking = pointer.inside && !reduced

      const dim = new Path2D()
      ctx.lineWidth = 1
      top.lineWidth = 1
      for (let y = offsetY; y < height + CELL; y += CELL) {
        for (let x = offsetX; x < width + CELL; x += CELL) {
          const heat = tracking
            ? Math.max(0, 1 - Math.hypot(x - pointer.x, y - pointer.y) / REACH) ** 1.6
            : 0
          const scan = scanY < 0 ? 0 : Math.max(0, 1 - Math.abs(y - scanY) / 60) * 0.55
          if (heat > 0.05) {
            top.strokeStyle = withAlpha(brand, 0.15 + heat * 0.75)
            top.beginPath()
            tick(top, x, y, 2.5 + heat * 3.5)
            top.stroke()
          } else if (scan > 0.05) {
            ctx.strokeStyle = withAlpha(brand, 0.2 + scan * 0.8)
            ctx.beginPath()
            tick(ctx, x, y, 2.5 + scan * 3.5)
            ctx.stroke()
          } else {
            tick(dim, x, y, 2.5)
          }
        }
      }
      ctx.strokeStyle = withAlpha(ink, 0.35)
      ctx.stroke(dim)

      if (scanY >= 0) {
        const gradient = ctx.createLinearGradient(0, scanY - 80, 0, scanY)
        gradient.addColorStop(0, withAlpha(brand, 0))
        gradient.addColorStop(1, withAlpha(brand, 0.06))
        ctx.fillStyle = gradient
        ctx.fillRect(0, scanY - 80, width, 80)
        ctx.fillStyle = withAlpha(brand, 0.18)
        ctx.fillRect(0, scanY, width, 1)
      }

      if (tracking) {
        const { x, y } = pointer
        top.strokeStyle = withAlpha(brand, 0.09)
        top.beginPath()
        top.moveTo(0, y)
        top.lineTo(width, y)
        top.moveTo(x, 0)
        top.lineTo(x, height)
        top.stroke()

        // 瞄准环：静止后逐渐收紧，像「锁定」目标。
        const settle = Math.min(1, (now - lockAt) / 600)
        const radius = 30 - settle * 10
        const spin = now * 0.0012
        top.strokeStyle = withAlpha(brand, 0.9)
        top.lineWidth = 1.5
        for (let i = 0; i < 4; i += 1) {
          const start = spin + (i * Math.PI) / 2 + 0.25
          top.beginPath()
          top.arc(x, y, radius, start, start + Math.PI / 3)
          top.stroke()
        }
        top.lineWidth = 1
        // 读数放在准星右上方，靠近右边缘时翻到左侧。
        const label = `X ${String(Math.round(x)).padStart(4, '0')}  Y ${String(Math.round(y)).padStart(4, '0')}`
        const status = settle >= 1 ? 'TARGET LOCKED' : 'TRACKING…'
        top.font = '10px ui-monospace, Consolas, monospace'
        const textWidth = Math.max(top.measureText(label).width, top.measureText(status).width)
        const flip = x + radius + 14 + textWidth > width - 8
        const tx = flip ? x - radius - 14 - textWidth : x + radius + 14
        const ty = y - radius - 4
        top.fillStyle = withAlpha('#050806', 0.72)
        top.fillRect(tx - 5, ty - 11, textWidth + 10, 28)
        top.fillStyle = withAlpha(brand, 0.95)
        top.fillText(label, tx, ty)
        top.fillStyle = withAlpha(brand, 0.6)
        top.fillText(status, tx, ty + 13)
      }

      if (!document.hidden && !reduced) frame = requestAnimationFrame(draw)
    }

    function restart() {
      cancelAnimationFrame(frame)
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
      lockAt = performance.now()
    }

    function onPointerLeave() {
      pointer.inside = false
    }

    function onResize() {
      resize()
      restart()
    }

    resize()
    restart()
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('visibilitychange', restart)
    motionQuery.addEventListener('change', restart)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', restart)
      motionQuery.removeEventListener('change', restart)
    }
  }, [])

  return (
    <>
      <canvas ref={baseRef} aria-hidden className={BASE_LAYER_CLASS} />
      <canvas ref={cursorRef} aria-hidden className={CURSOR_LAYER_CLASS} />
    </>
  )
}

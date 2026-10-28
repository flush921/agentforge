'use client'

import { useEffect, useRef } from 'react'
import { BASE_LAYER_CLASS, CURSOR_LAYER_CLASS, fitLayers, getLayer } from './canvas-layers'
import { readCssColor, withAlpha } from './use-theme'

/**
 * 星云背景：缓慢漂移的星点粒子，彼此靠近时连成星座线（底层）；
 * 光标像一颗引力源，吸引附近粒子并与它们连线（光标层，面板上方也可见）；
 * 点击处爆出一圈冲击波把粒子推开。
 */

const LINK = 130
const CURSOR_LINK = 190
const DENSITY = 1 / 11000
const MAX_PARTICLES = 160

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  hue: 0 | 1 | 2
}

export function NebulaField() {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const cursorRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const base = getLayer(baseRef.current)
    const cursor = getLayer(cursorRef.current)
    if (!base || !cursor) return
    const ctx = base.ctx
    const top = cursor.ctx
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const palette = [
      readCssColor('--brand', '#b794ff'),
      readCssColor('--chart-4', '#f472b6'),
      '#7dd3fc',
    ]
    let width = 0
    let height = 0
    let frame = 0
    let particles: Particle[] = []
    const pointer = { x: -9999, y: -9999, inside: false }

    function seed() {
      const count = Math.min(MAX_PARTICLES, Math.round(width * height * DENSITY))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: 0.6 + Math.random() * 1.6,
        hue: (Math.random() < 0.62 ? 0 : Math.random() < 0.5 ? 1 : 2) as Particle['hue'],
      }))
    }

    function resize() {
      ;({ width, height } = fitLayers([base!, cursor!]))
      seed()
    }

    function step(reduced: boolean) {
      for (const p of particles) {
        if (!reduced && pointer.inside) {
          const dx = pointer.x - p.x
          const dy = pointer.y - p.y
          const distance = Math.hypot(dx, dy)
          if (distance < CURSOR_LINK && distance > 1) {
            const pull = 0.012 * (1 - distance / CURSOR_LINK)
            p.vx += (dx / distance) * pull
            p.vy += (dy / distance) * pull
          }
        }
        p.vx *= 0.985
        p.vy *= 0.985
        // 保持最低漂移速度，避免粒子完全停下。
        if (Math.hypot(p.vx, p.vy) < 0.06) {
          p.vx += (Math.random() - 0.5) * 0.04
          p.vy += (Math.random() - 0.5) * 0.04
        }
        if (!reduced) {
          p.x += p.vx
          p.y += p.vy
        }
        if (p.x < -20) p.x = width + 20
        if (p.x > width + 20) p.x = -20
        if (p.y < -20) p.y = height + 20
        if (p.y > height + 20) p.y = -20
      }
    }

    function draw() {
      const reduced = motionQuery.matches
      step(reduced)
      ctx.clearRect(0, 0, width, height)
      top.clearRect(0, 0, width, height)
      ctx.lineWidth = 0.8
      top.lineWidth = 0.9
      for (let i = 0; i < particles.length; i += 1) {
        const a = particles[i]!
        for (let j = i + 1; j < particles.length; j += 1) {
          const b = particles[j]!
          const dx = a.x - b.x
          if (dx > LINK || dx < -LINK) continue
          const distance = Math.hypot(dx, a.y - b.y)
          if (distance < LINK) {
            ctx.strokeStyle = withAlpha(palette[a.hue]!, (1 - distance / LINK) * 0.34)
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }
      for (const p of particles) {
        ctx.fillStyle = withAlpha(palette[p.hue]!, 0.85)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      // 光标层：引力连线、被吸引的星点与光标处的柔光。
      if (pointer.inside && !reduced) {
        for (const p of particles) {
          const distance = Math.hypot(pointer.x - p.x, pointer.y - p.y)
          if (distance < CURSOR_LINK) {
            const t = 1 - distance / CURSOR_LINK
            top.strokeStyle = withAlpha(palette[p.hue]!, t * 0.7)
            top.beginPath()
            top.moveTo(pointer.x, pointer.y)
            top.lineTo(p.x, p.y)
            top.stroke()
            top.fillStyle = withAlpha(palette[p.hue]!, 0.5 + t * 0.5)
            top.beginPath()
            top.arc(p.x, p.y, p.r + 0.8, 0, Math.PI * 2)
            top.fill()
          }
        }
        const glow = top.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 90)
        glow.addColorStop(0, withAlpha(palette[0]!, 0.2))
        glow.addColorStop(1, withAlpha(palette[0]!, 0))
        top.fillStyle = glow
        top.fillRect(pointer.x - 90, pointer.y - 90, 180, 180)
      }
      if (!document.hidden && !reduced) frame = requestAnimationFrame(draw)
    }

    function restart() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerType === 'touch') return
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.inside = true
    }

    function onPointerLeave() {
      pointer.inside = false
    }

    function onPointerDown(event: PointerEvent) {
      if (motionQuery.matches) return
      for (const p of particles) {
        const dx = p.x - event.clientX
        const dy = p.y - event.clientY
        const distance = Math.hypot(dx, dy)
        if (distance < 260 && distance > 1) {
          const force = 3.2 * (1 - distance / 260)
          p.vx += (dx / distance) * force
          p.vy += (dy / distance) * force
        }
      }
    }

    function onResize() {
      resize()
      restart()
    }

    resize()
    restart()
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('visibilitychange', restart)
    motionQuery.addEventListener('change', restart)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
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

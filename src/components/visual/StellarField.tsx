'use client'

import { useEffect, useRef } from 'react'
import {
  constellationShape,
  galaxyShape,
  glyphShape,
  matchPoints,
  mulberry32,
  scatterShape,
  type GlyphMask,
  type StellarShape,
} from '@/lib/visual/stellar-shapes'
import { BASE_LAYER_CLASS, fitLayers, getLayer } from './canvas-layers'
import { withAlpha } from './use-theme'
import {
  distanceToSegment,
  dragWeight,
  DRAG_RADIUS,
  MAX_OFFSET,
  RISE_MS,
  SPRING_OMEGA,
} from '@/lib/visual/pointer-pull'

/**
 * 星辰背景（节奏参照逐帧分析的参考视频）。
 *
 * 开场按时间播放：星空淡入 → 静止片刻 → 星点缓缓收成一团星云 → 星云旋转着甩出旋臂成为银河。
 * 之后在「银河 → Ad Astra → 编排星座」之间轮换，每次都先收回星云、再展开成新形状。
 *
 * 滚动按位置驱动、可逆：往下滚，银河向后倾斜、变暗、变小，再松散成星云、散成背景星空；
 * 往回滚则按原路重新聚拢。每次滚动后用约 0.4 秒平滑追上。
 *
 * 光标会轻轻推开附近的星，被推开的星在一两秒内慢慢回到原位。
 */

export const FORMATIONS = ['galaxy', 'glyph', 'constellation'] as const
export type Formation = (typeof FORMATIONS)[number]

const HEADER = 64

// 开场时间轴（毫秒）。
const FADE_IN_AT = 1500
const FADE_IN_MS = 500
const GATHER_AT = 2600
/** 开场是一次连续的运动：先向中间汇聚，汇聚还没结束旋臂就开始展开（两段重叠），速度全程不归零。 */
const GATHER_MS = 2300
const GATHER_STAGGER = 380
const SWIRL_MS = 2000
const SWIRL_STAGGER = 260
const INTRO_OVERLAP = 900
const INTRO_END = GATHER_AT + GATHER_MS + SWIRL_MS - INTRO_OVERLAP

// 形态轮换：保持 → 收回星云 → 展开成下一个形态。
const HOLD_MS: Record<Formation, number> = { galaxy: 7000, glyph: 5200, constellation: 5200 }
/** 形态之间直接切换：每颗星沿一条微弯的弧线从旧位置飞向新位置，不经过任何公共的中间形态。 */
const MORPH_MS = 2100
const MORPH_STAGGER = 500
const MORPH_ARC = 0.16

// 银河自转与旋臂展开时的差速角度。
/** 银河盘面缓慢自转：约 6°/s，一圈大约一分钟，旋臂在倾斜的盘面上清晰地转动。 */
const SPIN = -0.00011
const UNWIND = 1.5
/** 银河在形态平面上的缩放与下移（单位坐标）：主体半径约为可用高度的 32%，核心略低于中线，
 * 让向上甩出的长臂留在画面内（参照参考视频量取）。 */
const GALAXY_SCALE = 1.05
const GALAXY_DROP = 0.12
/** 银河盘面本身就是倾斜的：纵向压成 56%，长轴朝右上抬起约 20°，像斜着看星空。 */
const GALAXY_FLAT = 0.56
const GALAXY_ROT = -0.36

// 滚动（以视口高度为单位）：倾斜阶段与消散阶段的区间。
const TILT_FROM = 0.03
const TILT_TO = 0.3
const DISSOLVE_FROM = 0.16
const DISSOLVE_TO = 0.6
const MAX_TILT = 0.8 // 往下滚时在已有倾斜上再向后倾约 46°
const TILT_TURN = -0.18
const SCROLL_EASE_MS = 140

const COLORS = ['#ffffff', '#8fb8ff', '#c9ddff', '#ffa866'] as const
const COLOR_WEIGHTS = [0.4, 0.3, 0.16, 0.14]

function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function easeOut(t: number) {
  return 1 - (1 - t) ** 3
}

/** 星点贴图：白色实心核 + 带颜色的光晕。 */
function makeSprite(color: string, size = 64): HTMLCanvasElement {
  const sprite = document.createElement('canvas')
  sprite.width = size
  sprite.height = size
  const g = sprite.getContext('2d')!
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  // 实心白核更大、光晕更饱满，接近参考里清晰发亮的星点。
  gradient.addColorStop(0, '#ffffff')
  gradient.addColorStop(0.13, '#ffffff')
  gradient.addColorStop(0.2, color)
  gradient.addColorStop(0.36, withAlpha(color, 0.5))
  gradient.addColorStop(0.62, withAlpha(color, 0.1))
  gradient.addColorStop(1, withAlpha(color, 0))
  g.fillStyle = gradient
  g.fillRect(0, 0, size, size)
  return sprite
}

/** 亮星的十字星芒。 */
function makeFlare(size = 128): HTMLCanvasElement {
  const sprite = document.createElement('canvas')
  sprite.width = size
  sprite.height = size
  const g = sprite.getContext('2d')!
  const half = size / 2
  for (const horizontal of [true, false]) {
    const gradient = horizontal
      ? g.createLinearGradient(0, half, size, half)
      : g.createLinearGradient(half, 0, half, size)
    gradient.addColorStop(0, 'rgba(210,228,255,0)')
    gradient.addColorStop(0.5, 'rgba(235,243,255,0.9)')
    gradient.addColorStop(1, 'rgba(210,228,255,0)')
    g.fillStyle = gradient
    if (horizontal) g.fillRect(0, half - 1, size, 2)
    else g.fillRect(half - 1, 0, 2, size)
  }
  return sprite
}

/** 把一行文字栅格化成蒙版，字号自动缩放到画布宽度的 92%。 */
function textMask(text: string, width = 640, height = 200): GlyphMask {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  const family = '"Segoe UI Black", "Arial Black", ui-sans-serif, system-ui, sans-serif'
  let fontSize = height * 0.8
  g.font = `900 ${fontSize}px ${family}`
  const measured = g.measureText(text).width
  if (measured > width * 0.92) fontSize *= (width * 0.92) / measured
  g.font = `900 ${Math.floor(fontSize)}px ${family}`
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, width / 2, height / 2 + fontSize * 0.04)
  const data = g.getImageData(0, 0, width, height).data
  const alpha = new Uint8Array(width * height)
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = data[i * 4 + 3]!
  return { width, height, alpha }
}

function pickColor(roll: number): number {
  let acc = 0
  for (let i = 0; i < COLOR_WEIGHTS.length; i += 1) {
    acc += COLOR_WEIGHTS[i]!
    if (roll < acc) return i
  }
  return 0
}

type Mode = 'intro' | 'hold' | 'morph'

function smoothstep(from: number, to: number, value: number) {
  const t = clamp01((value - from) / (to - from))
  return t * t * (3 - 2 * t)
}

/** 旋臂甩出：起步柔和、中段最快、末尾拖得较长，像参考里慢慢收紧落定。 */
function easeSwirl(t: number) {
  return 0.35 * easeInOut(t) + 0.65 * easeOut(t)
}

export function StellarField({ formation = false }: { formation?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const layer = getLayer(canvasRef.current)
    if (!layer) return
    const ctx = layer.ctx
    const root = document.documentElement
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sprites = COLORS.map((color) => makeSprite(color))
    const coreSprite = makeSprite('#e6eeff', 128)
    const flare = makeFlare()
    const rng = mulberry32(20261118)
    const small = window.innerWidth < 720
    const n = small ? 1100 : 2400
    const dustCount = small ? 160 : 340
    const glyphMask = textMask('Ad Astra')

    const galaxy = galaxyShape(n, mulberry32(11))
    const constellation = constellationShape(n, mulberry32(13))
    let glyph = glyphShape(n, mulberry32(12), glyphMask, 1.2)
    let field: StellarShape = scatterShape(n, mulberry32(10))

    // 银河里每颗星的极坐标，以及它在「星云」阶段的半径。
    const galaxyR = new Float32Array(n)
    const galaxyA = new Float32Array(n)
    const cloudR = new Float32Array(n)
    // 每颗星的外观与节奏。
    const size = new Float32Array(n)
    const bright = new Float32Array(n)
    const delay = new Float32Array(n)
    const twinkle = new Float32Array(n)
    const twinklePhase = new Float32Array(n)
    const driftAmp = new Float32Array(n)
    const driftFx = new Float32Array(n)
    const driftFy = new Float32Array(n)
    const driftPx = new Float32Array(n)
    const driftPy = new Float32Array(n)
    const color = new Uint8Array(n)
    const giant = new Uint8Array(n)
    // 光标推开造成的偏移（屏幕像素），由软弹簧慢慢拉回。
    const offX = new Float32Array(n)
    const offY = new Float32Array(n)
    const spdX = new Float32Array(n)
    const spdY = new Float32Array(n)
    // 光标刚带动、还没施加完的位移。
    const pendX = new Float32Array(n)
    const pendY = new Float32Array(n)
    for (let i = 0; i < n; i += 1) {
      const gx = galaxy.points[i * 2]!
      const gy = galaxy.points[i * 2 + 1]!
      galaxyR[i] = Math.hypot(gx, gy)
      galaxyA[i] = Math.atan2(gy, gx)
      // 星云半径约 0.8：收成的圆团直径约为可用高度的 45%，外圈的星对应银河外侧。
      cloudR[i] =
        (0.1 + 0.5 * Math.sqrt(Math.min(1, galaxyR[i]! / 1.6))) *
        (0.7 + rng() * 0.6) *
        // 少数外围的星离得更远，圆团边缘参差不齐。
        (rng() < 0.08 ? 1.5 + rng() * 0.5 : 1)
      const roll = rng()
      // 四成是暗淡的细碎星尘，填在亮星之间；极少数是带星芒的亮星。
      giant[i] = roll < 0.012 ? 1 : 0
      const faint = roll > 0.68
      size[i] = giant[i] ? 14 + rng() * 6 : faint ? 2.6 + rng() * 2.2 : 5 + rng() ** 2 * 8
      bright[i] = giant[i] ? 0.95 : faint ? 0.3 + rng() * 0.3 : 0.62 + rng() * 0.38
      delay[i] = rng()
      twinkle[i] = 0.5 + rng() * 1.8
      twinklePhase[i] = rng() * Math.PI * 2
      driftAmp[i] = 0.004 + rng() ** 1.5 * 0.01
      driftFx[i] = 0.00015 + rng() * 0.00035
      driftFy[i] = 0.00015 + rng() * 0.00035
      driftPx[i] = rng() * Math.PI * 2
      driftPy[i] = rng() * Math.PI * 2
      color[i] = pickColor(rng())
    }
    const dust = Array.from({ length: dustCount }, () => ({
      x: rng(),
      y: rng(),
      depth: 0.2 + rng() * 0.8,
      size: 2 + rng() * 3,
      alpha: 0.18 + rng() * 0.4,
      twinkle: 0.4 + rng() * 1.6,
      phase: rng() * Math.PI * 2,
      color: pickColor(rng()),
    }))

    let width = 0
    let height = 0
    let unit = 1
    let frame = 0
    let lastNow = performance.now()
    // 让成形那一刻的朝向正好是设计的朝向：长尾末端指向右上。
    let spinAngle = -SPIN * INTRO_END
    let lastFormation = ''
    let scrollEased = formation ? window.scrollY / Math.max(1, window.innerHeight) : 2
    const pointer = { x: -9999, y: -9999, lastX: 0, lastY: 0, hasLast: false, inside: false }
    const state: { mode: Mode; from: Formation; to: Formation; at: number } = {
      mode: 'intro',
      from: 'galaxy',
      to: 'galaxy',
      at: performance.now(),
    }

    function resize() {
      ;({ width, height } = fitLayers([layer!]))
      unit = 0.36 * Math.min(width, height - HEADER)
      // 背景星空铺满整个屏幕，四周略微出界。
      field = scatterShape(n, mulberry32(10), (width / 2 / unit) * 1.06, (height / 2 / unit) * 1.06)
      // 「Ad Astra」的宽度按两侧 Agent / Forge 的实际位置计算，保证不压字。
      const words = [...document.querySelectorAll<HTMLElement>('.stellar-word')].map((el) =>
        el.getBoundingClientRect(),
      )
      const sideBySide =
        words.length === 2 && Math.abs(words[0]!.top - words[1]!.top) < 20 && words[0]!.width > 0
      const room = sideBySide
        ? Math.min(width / 2 - words[0]!.right, words[1]!.left - width / 2) - 64
        : width * 0.44
      // 字形取点范围是半宽 extent 的 92%。
      glyph = glyphShape(
        n,
        mulberry32(12),
        glyphMask,
        Math.max(0.5, Math.min(1.25, room / unit / 0.92)),
      )
    }

    const swirlKey = new Float32Array(n)
    for (let i = 0; i < n; i += 1) {
      // 旋臂由内向外依次甩出：内圈先落定，外圈后到。
      swirlKey[i] = clamp01(Math.min(1, galaxyR[i]! / 1.6) * 0.7 + delay[i]! * 0.3)
    }

    /** 银河上第 i 颗星，q 为旋臂展开进度（0 = 星云，1 = 成形）。结果写入 out。 */
    function galaxyAt(i: number, q: number, out: Float32Array) {
      const r = galaxyR[i]!
      // 展开时内圈比外圈多转一些（差速旋转），旋臂像是被「转」出来的。
      const inner = Math.max(0, 1.8 - r) / 1.8
      const angle = galaxyA[i]! + spinAngle + (1 - q) * UNWIND * inner
      const radius = (cloudR[i]! + (r - cloudR[i]!) * q) * GALAXY_SCALE
      // 盘面随旋臂展开逐渐倾斜：星云阶段是圆团，成形后是斜着的银河。
      const flat = 1 - (1 - GALAXY_FLAT) * q
      const gx = Math.cos(angle) * radius
      const gy = Math.sin(angle) * radius * flat
      const rot = GALAXY_ROT * q
      const rc = Math.cos(rot)
      const rs = Math.sin(rot)
      out[0] = gx * rc - gy * rs
      out[1] = gx * rs + gy * rc + GALAXY_DROP
    }

    /**
     * 每颗星在每种形态里占用的点位（形态点集中的下标）。初始是恒等映射；
     * 每次形态切换时重新配对——让每颗星飞向新形态里离自己最近的位置，形变局部而连贯。
     */
    const slots: Record<Formation, Int32Array> = {
      galaxy: Int32Array.from({ length: n }, (_, i) => i),
      glyph: Int32Array.from({ length: n }, (_, i) => i),
      constellation: Int32Array.from({ length: n }, (_, i) => i),
    }

    function shapeAt(kind: Formation, i: number, out: Float32Array) {
      const slot = slots[kind][i]!
      if (kind === 'galaxy') return galaxyAt(slot, 1, out)
      const shape = kind === 'glyph' ? glyph : constellation
      out[0] = shape.points[slot * 2]!
      out[1] = shape.points[slot * 2 + 1]!
    }

    /** 某个形态所有点位此刻的位置快照（用于形态切换时做配对）。 */
    function snapshot(kind: Formation): Float32Array {
      const points = new Float32Array(n * 2)
      for (let slot = 0; slot < n; slot += 1) {
        if (kind === 'galaxy') {
          galaxyAt(slot, 1, tmpA)
          points[slot * 2] = tmpA[0]!
          points[slot * 2 + 1] = tmpA[1]!
        } else {
          const shape = kind === 'glyph' ? glyph : constellation
          points[slot * 2] = shape.points[slot * 2]!
          points[slot * 2 + 1] = shape.points[slot * 2 + 1]!
        }
      }
      return points
    }

    function beginMorph(now: number) {
      state.mode = 'morph'
      state.to = FORMATIONS[(FORMATIONS.indexOf(state.from) + 1) % FORMATIONS.length]!
      state.at = now
      const perm = matchPoints(snapshot(state.from), snapshot(state.to))
      const from = slots[state.from]
      const next = new Int32Array(n)
      for (let i = 0; i < n; i += 1) next[i] = perm[from[i]!]!
      slots[state.to] = next
    }

    /** 星云位置：与银河 q = 0 的状态一致，保证收拢与展开首尾相接。 */
    function cloudAt(i: number, out: Float32Array) {
      galaxyAt(i, 0, out)
    }

    const tmpA = new Float32Array(2)
    const tmpB = new Float32Array(2)

    /**
     * 第 i 颗星此刻在「形态平面」上的位置（单位坐标，未倾斜）。
     * 同时返回它离星云有多近（cloudness），用来调柔光。
     */
    function formationAt(i: number, now: number, out: Float32Array): number {
      if (state.mode === 'intro') {
        // 一次连续运动：g 把星从全屏散点拉向中心，q 让旋臂展开；两段重叠，所以没有停顿。
        const t = now - state.at - GATHER_AT
        const g = easeInOut(clamp01((t - delay[i]! * GATHER_STAGGER) / GATHER_MS))
        const q = easeSwirl(
          clamp01((t - (GATHER_MS - INTRO_OVERLAP) - swirlKey[i]! * SWIRL_STAGGER) / SWIRL_MS),
        )
        galaxyAt(i, q, tmpA)
        const fx = field.points[i * 2]!
        const fy = field.points[i * 2 + 1]!
        out[0] = fx + (tmpA[0]! - fx) * g
        out[1] = fy + (tmpA[1]! - fy) * g
        return g * (1 - q)
      }
      if (state.mode === 'hold') {
        shapeAt(state.from, i, out)
        return 0
      }
      // 变换：直接从旧形态飞向新形态。每颗星错开出发，沿一条微弯的弧线运动，
      // 弧的朝向因星而异，整体像一股星流涌向新位置。
      const t = now - state.at
      const p = easeInOut(clamp01((t - delay[i]! * MORPH_STAGGER) / MORPH_MS))
      shapeAt(state.from, i, tmpA)
      shapeAt(state.to, i, tmpB)
      const dx = tmpB[0]! - tmpA[0]!
      const dy = tmpB[1]! - tmpA[1]!
      const arc = Math.sin(Math.PI * p) * MORPH_ARC * Math.sin(twinklePhase[i]!)
      out[0] = tmpA[0]! + dx * p - dy * arc
      out[1] = tmpA[1]! + dy * p + dx * arc
      return 0
    }

    const MORPH_TOTAL = MORPH_MS + MORPH_STAGGER

    /** 推进形态状态机；页面滚开时暂停，回到顶部后从原处继续。 */
    function advance(now: number, dt: number, paused: boolean) {
      if (paused) {
        state.at += dt
        return
      }
      const t = now - state.at
      if (state.mode === 'intro' && t >= INTRO_END + SWIRL_STAGGER) {
        state.mode = 'hold'
        state.at = now
      } else if (state.mode === 'hold' && t >= HOLD_MS[state.from]) {
        beginMorph(now)
      } else if (state.mode === 'morph' && t >= MORPH_TOTAL) {
        state.mode = 'hold'
        state.from = state.to
        state.at = now
      }
    }

    /** 当前对外显示的形态名（说明文字用）。 */
    function showing(now: number): Formation {
      if (state.mode === 'morph' && now - state.at > MORPH_TOTAL * 0.45) return state.to
      return state.from
    }

    const mountAt = performance.now()
    if (!formation || motionQuery.matches) {
      state.mode = 'hold'
      state.at = mountAt
    }
    const point = new Float32Array(2)
    const cloud = new Float32Array(2)

    /** 某个形态的柔光强度：保持时为 1，变换时随收拢淡出、随展开淡入。 */
    function glowWeight(kind: Formation, now: number): number {
      if (state.mode === 'hold') return state.from === kind ? 1 : 0
      if (state.mode !== 'morph') return 0
      const t = now - state.at
      if (state.from === kind) return 1 - smoothstep(0, MORPH_TOTAL * 0.55, t)
      if (state.to === kind) return smoothstep(MORPH_TOTAL * 0.35, MORPH_TOTAL, t)
      return 0
    }

    function draw(now: number) {
      const reduced = motionQuery.matches
      const dt = Math.min(50, Math.max(0, now - lastNow))
      lastNow = now
      if (reduced && state.mode !== 'hold') {
        state.mode = 'hold'
        state.from = 'galaxy'
      }

      // 滚动：目标进度随位置变化，画面平滑追上（减少动效时直接到位）。
      const scrollTarget = formation ? window.scrollY / Math.max(1, height) : 2
      scrollEased = reduced
        ? scrollTarget
        : scrollEased + (scrollTarget - scrollEased) * (1 - Math.exp(-dt / SCROLL_EASE_MS))
      const tilt = smoothstep(TILT_FROM, TILT_TO, scrollEased)
      const dissolve = smoothstep(DISSOLVE_FROM, DISSOLVE_TO, scrollEased)
      const toCloud = smoothstep(0, 0.4, dissolve)
      const toField = smoothstep(0.22, 0.75, dissolve)
      advance(now, dt, reduced || dissolve > 0.3)
      if (!reduced) spinAngle += dt * SPIN
      if (formation && dissolve < 0.3) {
        const name = showing(now)
        if (name !== lastFormation) {
          root.dataset.formation = name
          lastFormation = name
        }
      }

      // 减少动效时只画一帧静态画面，必须一开始就是完整亮度，否则会停在 fade = 0 的空白帧上。
      const fade = reduced
        ? 1
        : formation
          ? smoothstep(FADE_IN_AT, FADE_IN_AT + FADE_IN_MS, now - mountAt)
          : smoothstep(0, 600, now - mountAt)
      const squash = Math.cos(tilt * MAX_TILT)
      const scale = 1 - 0.22 * tilt
      const turn = TILT_TURN * tilt
      const turnCos = Math.cos(turn)
      const turnSin = Math.sin(turn)
      const baseCx = width / 2
      const baseCy = HEADER + (height - HEADER) / 2
      const cx = baseCx
      const cy = baseCy - tilt * (height - HEADER) * 0.1
      const dim = (1 - 0.38 * tilt) * (1 - 0.4 * toField)

      // 光标这一帧走过的线段：只有紧贴这条轨迹的星才会被沿运动方向带走。
      let moveX = pointer.hasLast ? pointer.x - pointer.lastX : 0
      let moveY = pointer.hasLast ? pointer.y - pointer.lastY : 0
      const moved = Math.hypot(moveX, moveY)
      if (moved > 80) {
        // 瞬移（比如光标从窗口外进来）不算划过。
        moveX = 0
        moveY = 0
      }
      const dragging = pointer.inside && !reduced && moved > 0.4 && moved <= 80
      const apply = 1 - Math.exp(-dt / RISE_MS)
      const seconds = dt / 1000
      const glyphHold = state.mode === 'hold' && state.from === 'glyph'

      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      // 远处的星尘：一直都在，缓慢闪烁。
      for (const star of dust) {
        const x = star.x * width
        const raw = star.y * height - scrollEased * height * 0.05 * star.depth
        const y = ((raw % height) + height) % height
        const flicker = reduced
          ? 1
          : 0.55 + 0.45 * Math.sin(now * 0.001 * star.twinkle + star.phase)
        ctx.globalAlpha = star.alpha * flicker * Math.max(fade, 0.15)
        const s = star.size
        ctx.drawImage(sprites[star.color]!, x - s / 2, y - s / 2, s, s)
      }

      // 银河显示的程度：臂上成团的星在银河里是「亮珠」，在文字和星座里还原为普通星点。
      const galaxyShow =
        state.mode === 'intro'
          ? smoothstep(GATHER_AT + GATHER_MS - INTRO_OVERLAP, INTRO_END, now - state.at)
          : glowWeight('galaxy', now)
      const beads = galaxy.beads!
      // 漂浮幅度随当前形态变化：银河 1×，文字 1.9×，星座 2.4×——静止的形态也在轻轻飘。
      const wG = glowWeight('galaxy', now)
      const wT = glowWeight('glyph', now)
      const wC = glowWeight('constellation', now)
      const wSum = wG + wT + wC
      const driftScale =
        state.mode === 'intro' || wSum < 0.01 ? 1 : (wG * 1 + wT * 1.9 + wC * 2.4) / wSum
      let cloudSum = 0
      for (let i = 0; i < n; i += 1) {
        let cloudness = formationAt(i, now, point)
        let x = point[0]!
        let y = point[1]!
        if (toCloud > 0) {
          // 往下滚时先松散回星云……
          cloudAt(i, cloud)
          x += (cloud[0]! - x) * toCloud
          y += (cloud[1]! - y) * toCloud
          cloudness += (1 - cloudness) * toCloud
        }
        if (!reduced) {
          // 各自缓慢漂浮；文字形态几乎不漂，保证字形清晰。
          const amp = driftAmp[i]! * driftScale
          const fx = driftFx[i]!
          const fy = driftFy[i]!
          x +=
            amp * (Math.sin(now * fx + driftPx[i]!) + 0.5 * Math.sin(now * fy * 1.9 + driftPy[i]!))
          y +=
            amp * (Math.cos(now * fy + driftPy[i]!) + 0.5 * Math.cos(now * fx * 1.7 + driftPx[i]!))
        }
        // 向后倾斜：纵向按倾角压扁，长轴略微偏转，同时缩小、上移。
        const sy = y * squash
        let tx = cx + (x * turnCos - sy * turnSin) * unit * scale
        let ty = cy + (x * turnSin + sy * turnCos) * unit * scale
        if (toField > 0) {
          // ……再散成铺满全屏的背景星空。
          let fx = baseCx + field.points[i * 2]! * unit
          let fy = baseCy + field.points[i * 2 + 1]! * unit
          if (!reduced) {
            // 满天星也在缓缓飘：每颗星沿各自的慢速轨迹游走，幅度约 5~14 像素，近处的星飘得更明显。
            const wander = driftAmp[i]! * 3.4 * unit
            fx +=
              wander *
              (Math.sin(now * driftFx[i]! * 0.8 + driftPx[i]!) +
                0.6 * Math.sin(now * driftFy[i]! * 1.7 + driftPy[i]!))
            fy +=
              wander *
              (Math.cos(now * driftFy[i]! * 0.8 + driftPy[i]!) +
                0.6 * Math.cos(now * driftFx[i]! * 1.5 + driftPx[i]!))
          }
          tx += (fx - tx) * toField
          ty += (fy - ty) * toField
        }
        cloudSum += cloudness * (1 - toField)

        // 光标轨迹附近的星被沿运动方向带走一小段：先记入待施加量再逐步施加，
        // 然后由一根临界阻尼弹簧拉回原位——按参考视频实测，尖刺先保持近一秒、再用约三秒平复，不过冲。
        if (!reduced) {
          if (dragging) {
            const d = distanceToSegment(
              tx + offX[i]!,
              ty + offY[i]!,
              pointer.lastX,
              pointer.lastY,
              pointer.x,
              pointer.y,
            )
            if (d < DRAG_RADIUS) {
              const weight = dragWeight(d)
              pendX[i] = pendX[i]! + moveX * weight
              pendY[i] = pendY[i]! + moveY * weight
            }
          }
          const stepX = pendX[i]! * apply
          const stepY = pendY[i]! * apply
          pendX[i] = pendX[i]! - stepX
          pendY[i] = pendY[i]! - stepY
          let x = offX[i]! + stepX
          let y = offY[i]! + stepY
          let vx = spdX[i]!
          let vy = spdY[i]!
          vx += (-SPRING_OMEGA * SPRING_OMEGA * x - 2 * SPRING_OMEGA * vx) * seconds
          vy += (-SPRING_OMEGA * SPRING_OMEGA * y - 2 * SPRING_OMEGA * vy) * seconds
          x += vx * seconds
          y += vy * seconds
          const length = Math.hypot(x, y)
          if (length > MAX_OFFSET) {
            x *= MAX_OFFSET / length
            y *= MAX_OFFSET / length
          }
          offX[i] = x
          offY[i] = y
          spdX[i] = vx
          spdY[i] = vy
        }
        const px = tx + offX[i]!
        const py = ty + offY[i]!

        const flicker = reduced
          ? 1
          : 0.72 + 0.28 * Math.sin(now * 0.001 * twinkle[i]! + twinklePhase[i]!)
        const bead = beads[slots.galaxy[i]!]! * galaxyShow
        const alpha = Math.min(1, bright[i]! * (1 + 0.45 * bead) * flicker * fade * dim)
        if (alpha < 0.02) continue
        const s = size[i]! * (1 + 0.85 * bead) * (1 - 0.15 * toField)
        ctx.globalAlpha = Math.min(1, alpha)
        ctx.drawImage(sprites[color[i]!]!, px - s / 2, py - s / 2, s, s)
        if (giant[i] && toField < 0.5 && !glyphHold) {
          const f = s * 2.4
          ctx.globalAlpha = alpha * 0.4 * (1 - toField * 2)
          ctx.drawImage(flare, px - f / 2, py - f / 2, f, f)
        }
      }

      pointer.lastX = pointer.x
      pointer.lastY = pointer.y
      pointer.hasLast = pointer.inside

      // 柔光（叠加混合，与绘制顺序无关）：星云中心微光、银河核心、星座节点。
      const cloudLevel = (cloudSum / n) * fade
      // 银河核心在屏幕上的位置（随倾斜一起变换）。
      const coreX = cx - GALAXY_DROP * squash * turnSin * unit * scale
      const coreY = cy + GALAXY_DROP * squash * turnCos * unit * scale
      if (cloudLevel > 0.01) {
        // 星云中心只留一点点微光，避免整团发灰。
        const r = unit * 0.6 * scale
        ctx.globalAlpha = 0.05 * cloudLevel * dim
        ctx.drawImage(coreSprite, coreX - r / 2, coreY - r / 2, r, r)
      }
      const galaxyGlow = galaxyShow * fade * (1 - toCloud)
      if (galaxyGlow > 0.01) {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(turn)
        ctx.scale(scale, scale * squash)
        ctx.translate(0, GALAXY_DROP * unit)
        ctx.rotate(GALAXY_ROT)
        ctx.scale(1, GALAXY_FLAT)
        for (const glow of galaxy.glows) {
          const r = glow.r * unit * 2 * GALAXY_SCALE
          ctx.globalAlpha = Math.min(1, glow.a * galaxyGlow * dim)
          ctx.drawImage(coreSprite, -r / 2, -r / 2, r, r)
        }
        ctx.restore()
      }
      const nodeGlow = glowWeight('constellation', now) * fade * (1 - toCloud)
      if (nodeGlow > 0.01) {
        for (const glow of constellation.glows) {
          const r = glow.r * unit * 2 * scale
          const sy = glow.y * squash
          const gx = cx + (glow.x * turnCos - sy * turnSin) * unit * scale
          const gy = cy + (glow.x * turnSin + sy * turnCos) * unit * scale
          ctx.globalAlpha = Math.min(1, glow.a * nodeGlow * dim)
          ctx.drawImage(coreSprite, gx - r / 2, gy - r / 2, r, r)
        }
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      if (!reduced && !document.hidden) frame = requestAnimationFrame(draw)
    }

    function redraw() {
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

    function onScroll() {
      // 减少动效时没有 rAF 循环，滚动后手动重画一帧。
      if (motionQuery.matches) redraw()
    }

    function onResize() {
      resize()
      redraw()
    }

    resize()
    redraw()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    root.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('visibilitychange', redraw)
    motionQuery.addEventListener('change', redraw)
    return () => {
      cancelAnimationFrame(frame)
      delete root.dataset.formation
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', redraw)
      motionQuery.removeEventListener('change', redraw)
    }
  }, [formation])

  return <canvas ref={canvasRef} aria-hidden className={BASE_LAYER_CLASS} />
}

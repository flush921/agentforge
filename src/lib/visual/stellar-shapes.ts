/**
 * 星辰首屏的粒子目标形状。所有坐标都在「单位空间」里：原点在画面中心，
 * 1 个单位约等于 0.34 × 屏幕短边，y 轴向下。每个形状返回同样数量的点，
 * 粒子按下标一一对应地在形状之间迁移。
 */

export type Rng = () => number

export interface ShapeGlow {
  x: number
  y: number
  r: number
  a: number
}

export interface StellarShape {
  /** 交错存放的 [x0, y0, x1, y1, …]，长度为 2n。 */
  points: Float32Array
  /** 叠加在形状上的柔光（星系核心、星座节点）。 */
  glows: ShapeGlow[]
  /** 是否随时间缓慢自转。 */
  spin: boolean
  /** 每颗星的「亮珠」权重 0~1：银河旋臂上成团的星更大更亮，其余为细碎星尘。 */
  beads?: Float32Array
}

export interface GlyphMask {
  width: number
  height: number
  /** 每个像素的不透明度，0~255。 */
  alpha: ArrayLike<number>
}

/** 可复现的伪随机数，便于测试与每次加载得到同样的星系。 */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(rng: Rng): number {
  const u = Math.max(rng(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

/** 散布在整个画面（含两侧）的星点。 */
export function scatterShape(n: number, rng: Rng, spreadX = 2.6, spreadY = 1.6): StellarShape {
  const points = new Float32Array(n * 2)
  for (let i = 0; i < n; i += 1) {
    points[i * 2] = (rng() * 2 - 1) * spreadX
    points[i * 2 + 1] = (rng() * 2 - 1) * spreadY
  }
  return { points, glows: [], spin: false }
}

/** 银河旋臂：对数螺旋 r = R0·e^(Bθ)，每转一圈半径约放大 3.3 倍；θ 增大即屏幕上顺时针外旋。 */
const ARM_R0 = 0.13
const ARM_B = 0.19
/** 两条臂共同的主体长度（弧度），走到半径约 1.0。 */
export const ARM_MAIN = Math.log(1 / ARM_R0) / ARM_B
/** 长臂在主体之后再甩出的长度，以及甩到的半径。 */
export const ARM_TAIL = 0.9
export const TAIL_REACH = 1.25
/** 长臂末端指向屏幕右上方（y 轴向下时约 -64°）。 */
const TAIL_END_ANGLE = -0.95

/** 第 θ 弧度处旋臂的半径；长臂在 ARM_MAIN 之后加速向外甩出。 */
export function armRadius(theta: number): number {
  if (theta <= ARM_MAIN) return ARM_R0 * Math.exp(ARM_B * theta)
  const t = Math.min(1, (theta - ARM_MAIN) / ARM_TAIL)
  return 1 + (TAIL_REACH - 1) * t ** 1.4
}

/**
 * 双臂旋涡星系，形如「6」（参照参考视频逐帧量取）：两条臂从核心向外顺时针盘绕约 1.7 圈，
 * 主体半径约 1；其中一条长臂再沿左侧向上甩出，末端停在右上方、半径约 1.75。
 * 臂上的星成串成团，臂间留出空隙；核球小而亮。坐标以盘面中心为原点。
 */
export function galaxyShape(n: number, rng: Rng): StellarShape {
  const points = new Float32Array(n * 2)
  const beads = new Float32Array(n)
  const startLong = TAIL_END_ANGLE - (ARM_MAIN + ARM_TAIL)
  for (let i = 0; i < n; i += 1) {
    const roll = rng()
    let x: number
    let y: number
    if (roll < 0.07) {
      const r = Math.abs(gauss(rng)) * 0.07
      const angle = rng() * Math.PI * 2
      x = Math.cos(angle) * r
      y = Math.sin(angle) * r
    } else if (roll < 0.15) {
      const r = Math.abs(gauss(rng)) * 0.19
      const angle = rng() * Math.PI * 2
      x = Math.cos(angle) * r
      y = Math.sin(angle) * r
    } else if (roll < 0.2) {
      // 盘面上稀疏的散星，填在旋臂之间。
      const r = 0.2 + rng() ** 0.7 * 0.85
      const angle = rng() * Math.PI * 2
      x = Math.cos(angle) * r
      y = Math.sin(angle) * r
    } else {
      const long = rng() < 0.5
      const length = long ? ARM_MAIN + ARM_TAIL : ARM_MAIN * 0.97
      const theta0 = 0.6
      // 外圈弧长更长，按半径加权取点，并给长臂甩出的一段单独加密，保证「6」的长尾清晰。
      let theta =
        long && rng() < 0.22
          ? ARM_MAIN + rng() * ARM_TAIL
          : theta0 + (length - theta0) * rng() ** 0.62
      // 七成的星聚成臂上的星团（约每 0.32 弧度一团），其余沿臂散开；
      // 越贴近团心的星越像一颗「亮珠」。
      if (rng() < 0.7) {
        const centre = Math.round(theta / 0.32) * 0.32
        const off = gauss(rng) * 0.025
        theta = centre + off
        beads[i] = Math.max(0, 1 - Math.abs(off) / 0.05)
      }
      theta = Math.min(length, Math.max(theta0, theta))
      const r = armRadius(theta)
      const angle = (long ? startLong : startLong + Math.PI) + theta
      const spread = 0.012 + 0.035 * Math.min(1, r)
      x = Math.cos(angle) * r + gauss(rng) * spread
      y = Math.sin(angle) * r + gauss(rng) * spread
    }
    // 参考里的银河略呈竖长（像「6」），横向收窄一点。
    points[i * 2] = x * 0.9
    points[i * 2 + 1] = y
  }
  return {
    points,
    glows: [
      { x: 0, y: 0, r: 0.2, a: 0.6 },
      { x: 0, y: 0, r: 0.46, a: 0.26 },
      { x: 0, y: 0, r: 0.95, a: 0.1 },
    ],
    spin: true,
    beads,
  }
}

/** 星座节点：对应一次 L4 编排——任务、三路并行调研、写作、审校、交付。 */
export const CONSTELLATION_NODES = [
  { id: 'task', x: -0.98, y: 0, weight: 0.8 },
  { id: 'gather-a', x: -0.42, y: -0.6, weight: 1 },
  { id: 'gather-b', x: -0.42, y: 0, weight: 1 },
  { id: 'gather-c', x: -0.42, y: 0.6, weight: 1 },
  { id: 'writer', x: 0.16, y: 0, weight: 1.15 },
  { id: 'review', x: 0.58, y: 0, weight: 1 },
  { id: 'output', x: 0.98, y: 0, weight: 0.8 },
] as const

type NodeId = (typeof CONSTELLATION_NODES)[number]['id']

/** 连线；`bend` 为二次贝塞尔控制点相对中点的纵向偏移（返工弧向上拱起）。 */
export const CONSTELLATION_EDGES: ReadonlyArray<{ from: NodeId; to: NodeId; bend: number }> = [
  { from: 'task', to: 'gather-a', bend: 0 },
  { from: 'task', to: 'gather-b', bend: 0 },
  { from: 'task', to: 'gather-c', bend: 0 },
  { from: 'gather-a', to: 'writer', bend: 0 },
  { from: 'gather-b', to: 'writer', bend: 0 },
  { from: 'gather-c', to: 'writer', bend: 0 },
  { from: 'writer', to: 'review', bend: 0 },
  { from: 'review', to: 'writer', bend: -0.5 },
  { from: 'review', to: 'output', bend: 0 },
]

export function constellationShape(n: number, rng: Rng): StellarShape {
  const points = new Float32Array(n * 2)
  const nodes = new Map(CONSTELLATION_NODES.map((node) => [node.id, node]))
  const totalWeight = CONSTELLATION_NODES.reduce((sum, node) => sum + node.weight, 0)
  for (let i = 0; i < n; i += 1) {
    let x: number
    let y: number
    if (rng() < 0.56) {
      // 按权重挑一个节点，在它周围聚成一团星。
      let pick = rng() * totalWeight
      let node: (typeof CONSTELLATION_NODES)[number] = CONSTELLATION_NODES[0]
      for (const candidate of CONSTELLATION_NODES) {
        pick -= candidate.weight
        node = candidate
        if (pick <= 0) break
      }
      const spread = 0.055 * node.weight
      x = node.x + gauss(rng) * spread
      y = node.y + gauss(rng) * spread
    } else {
      const edge = CONSTELLATION_EDGES[Math.floor(rng() * CONSTELLATION_EDGES.length)]!
      const from = nodes.get(edge.from)!
      const to = nodes.get(edge.to)!
      const t = rng()
      const cx = (from.x + to.x) / 2
      const cy = (from.y + to.y) / 2 + edge.bend
      const a = (1 - t) * (1 - t)
      const b = 2 * (1 - t) * t
      const c = t * t
      x = a * from.x + b * cx + c * to.x + gauss(rng) * 0.012
      y = a * from.y + b * cy + c * to.y + gauss(rng) * 0.012
    }
    points[i * 2] = x
    points[i * 2 + 1] = y
  }
  return {
    points,
    glows: CONSTELLATION_NODES.map((node) => ({
      x: node.x,
      y: node.y,
      r: 0.16 * node.weight,
      a: 0.5,
    })),
    spin: false,
  }
}

/**
 * 按字形蒙版取点（例如字母「A」）。蒙版为空时退回星系，保证总能得到有效形状。
 * `extent` 是字形在单位空间里的半宽。
 */
export function glyphShape(n: number, rng: Rng, mask: GlyphMask, extent = 1.05): StellarShape {
  const on = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < mask.width &&
    y < mask.height &&
    (mask.alpha[y * mask.width + x] ?? 0) > 128
  const filled: number[] = []
  const edge: number[] = []
  for (let y = 0; y < mask.height; y += 2) {
    for (let x = 0; x < mask.width; x += 2) {
      if (!on(x, y)) continue
      filled.push(x, y)
      if (!on(x - 2, y) || !on(x + 2, y) || !on(x, y - 2) || !on(x, y + 2)) edge.push(x, y)
    }
  }
  if (filled.length === 0) return galaxyShape(n, rng)
  const points = new Float32Array(n * 2)
  const half = Math.max(mask.width, mask.height) / 2
  for (let i = 0; i < n; i += 1) {
    // 七成落在轮廓上，字形边缘更清晰；其余填充内部。
    const source = edge.length > 0 && rng() < 0.72 ? edge : filled
    const k = Math.floor(rng() * (source.length / 2)) * 2
    points[i * 2] = ((source[k]! - mask.width / 2) / half) * extent + gauss(rng) * 0.0045
    points[i * 2 + 1] = ((source[k + 1]! - mask.height / 2) / half) * extent + gauss(rng) * 0.0045
  }
  return { points, glows: [{ x: 0, y: 0.05, r: 0.9, a: 0.12 }], spin: false }
}

/**
 * 把形状 a 的每个点配给形状 b 里空间位置对应的点（两者点数相同），返回 perm：a 的第 s 个点 → b 的第 perm[s] 个点。
 * 做法：两边都按 x 切成等量的竖条，条内按 y 排序，再按顺序一一对应——相当于一个保序的"分位数对分位数"映射。
 * 这样形变是局部且连贯的：线性插值的中间帧不会像随机配对那样糊成一团。
 */
export function matchPoints(a: Float32Array, b: Float32Array): Int32Array {
  const n = a.length / 2
  const strips = Math.max(1, Math.round(Math.sqrt(n)))
  const order = (points: Float32Array): Int32Array => {
    const byX = Array.from({ length: n }, (_, i) => i).sort(
      (p, q) => points[p * 2]! - points[q * 2]!,
    )
    const chunk = Math.ceil(n / strips)
    const result = new Int32Array(n)
    let at = 0
    for (let start = 0; start < n; start += chunk) {
      const slice = byX
        .slice(start, start + chunk)
        .sort((p, q) => points[p * 2 + 1]! - points[q * 2 + 1]!)
      for (const index of slice) result[at++] = index
    }
    return result
  }
  const orderA = order(a)
  const orderB = order(b)
  const perm = new Int32Array(n)
  for (let k = 0; k < n; k += 1) perm[orderA[k]!] = orderB[k]!
  return perm
}

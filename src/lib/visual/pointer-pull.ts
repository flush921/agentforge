/**
 * 光标「拖拽」模型（逐帧分析参考视频得到）：
 * - 光标扫过旋臂时，只有紧贴光标轨迹的星被沿着光标运动的方向带走一小段，拉出一根短尖刺；
 *   影响范围很窄（尖刺根部只有一百来像素高），光标停下或远离后不会再拉任何星。
 * - 尖刺在光标离开后还会继续长一点（约 0.4 秒），再保持近一秒，然后用约三秒平复。
 * 一切都以「光标这一帧走过的线段」为单位，所以不依赖帧率，也不依赖光标现在停在哪里。
 */

/** 影响半径（像素）：只有离光标轨迹这么近的星才会被带动。 */
export const DRAG_RADIUS = 46
/** 轨迹正中的星被带走光标位移的这一比例；越靠边越少。 */
export const DRAG_STRENGTH = 0.6
export const DRAG_POWER = 1.5

/** 被带动的位移先累积为「待施加量」，再以此时间常数逐步施加，所以尖刺在光标离开后还会继续长一会儿。 */
export const RISE_MS = 130
/**
 * 带离原位的星由一根临界阻尼弹簧拉回：x'' = -ω²x - 2ωx'。
 * 参考视频里尖刺回落的实测占比是 1、0.83、0.58、0.33、0.13、0.05（间隔 0.7 秒），
 * 与 (1+ωt)·e^(−ωt)、ω≈1.1/s 吻合：先保持近一秒，再用约三秒平复，不过冲。
 */
export const SPRING_OMEGA = 1.1
/** 单颗星被带离原位的最大距离（像素）。 */
export const MAX_OFFSET = 52

/** 点 (px, py) 到线段 (ax, ay)–(bx, by) 的距离。 */
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax
  const aby = by - ay
  const lengthSq = abx * abx + aby * aby
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSq))
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t))
}

/** 离轨迹 d 像素的星，被带走光标位移的多少倍。 */
export function dragWeight(distance: number): number {
  if (distance >= DRAG_RADIUS) return 0
  return DRAG_STRENGTH * (1 - Math.max(0, distance) / DRAG_RADIUS) ** DRAG_POWER
}

/** 位移施加完毕 ms 毫秒后，剩余位移占比（初速度为 0 的临界阻尼弹簧）。 */
export function remainingAfter(ms: number): number {
  const x = (SPRING_OMEGA * ms) / 1000
  return (1 + x) * Math.exp(-x)
}

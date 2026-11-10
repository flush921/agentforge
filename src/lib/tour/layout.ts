/** 新手教程里高亮框和说明卡片的位置计算。都是视口坐标，纯函数，方便测试。 */

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** 高亮框比目标元素大出的一圈。 */
export const SPOT_PAD = 6
/** 卡片与高亮框之间的间距。 */
const GAP = 12
/** 卡片与视口边缘的最小距离。 */
const EDGE = 12

/**
 * 卡片放在哪：优先放在高亮框的下、上、右、左（按这个顺序取第一个放得下的位置）。
 * 目标太大、四周都放不下时贴着视口下沿（目标整体在下半屏时贴上沿），尽量不挡住目标的主要内容。
 * 没有高亮目标时：居中，或贴着下沿居中。
 */
export function cardPosition(
  box: Box | null,
  card: Size,
  viewport: Size,
  fallback: 'center' | 'bottom',
): { left: number; top: number } {
  const maxLeft = Math.max(EDGE, viewport.width - card.width - EDGE)
  const maxTop = Math.max(EDGE, viewport.height - card.height - EDGE)
  const clampX = (value: number) => Math.min(Math.max(value, EDGE), maxLeft)
  const clampY = (value: number) => Math.min(Math.max(value, EDGE), maxTop)
  const centerLeft = clampX((viewport.width - card.width) / 2)

  if (box === null) {
    return fallback === 'center'
      ? { left: centerLeft, top: clampY((viewport.height - card.height) / 2) }
      : { left: centerLeft, top: maxTop }
  }

  const centerX = box.left + box.width / 2
  const centerY = box.top + box.height / 2
  const offset = SPOT_PAD + GAP
  const candidates = [
    { left: clampX(centerX - card.width / 2), top: box.top + box.height + offset },
    { left: clampX(centerX - card.width / 2), top: box.top - offset - card.height },
    { left: box.left + box.width + offset, top: clampY(centerY - card.height / 2) },
    { left: box.left - offset - card.width, top: clampY(centerY - card.height / 2) },
  ]
  const fits = candidates.find(
    (candidate) =>
      candidate.left >= EDGE &&
      candidate.left <= maxLeft &&
      candidate.top >= EDGE &&
      candidate.top <= maxTop,
  )
  if (fits !== undefined) return fits

  return { left: centerLeft, top: box.top > viewport.height / 2 ? EDGE : maxTop }
}

export function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b
  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  )
}

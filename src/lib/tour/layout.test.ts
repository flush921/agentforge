import { describe, expect, it } from 'vitest'
import { cardPosition, sameBox, type Box } from './layout'

const viewport = { width: 1280, height: 800 }
const card = { width: 340, height: 200 }

function inside(position: { left: number; top: number }): boolean {
  return (
    position.left >= 12 &&
    position.top >= 12 &&
    position.left + card.width <= viewport.width - 12 &&
    position.top + card.height <= viewport.height - 12
  )
}

function overlaps(position: { left: number; top: number }, box: Box): boolean {
  return !(
    position.left + card.width <= box.left ||
    position.left >= box.left + box.width ||
    position.top + card.height <= box.top ||
    position.top >= box.top + box.height
  )
}

describe('cardPosition', () => {
  it('没有高亮目标时居中，或贴着下沿居中', () => {
    expect(cardPosition(null, card, viewport, 'center')).toEqual({ left: 470, top: 300 })
    expect(cardPosition(null, card, viewport, 'bottom')).toEqual({ left: 470, top: 588 })
  })

  it('目标下方放得下时放在下方，并与目标水平居中对齐', () => {
    const box = { left: 500, top: 100, width: 200, height: 60 }
    const position = cardPosition(box, card, viewport, 'bottom')

    expect(position.top).toBeGreaterThanOrEqual(box.top + box.height)
    expect(position.left).toBe(430)
    expect(inside(position)).toBe(true)
    expect(overlaps(position, box)).toBe(false)
  })

  it('目标贴着屏幕底部时放到上方', () => {
    const box = { left: 100, top: 700, width: 300, height: 80 }
    const position = cardPosition(box, card, viewport, 'bottom')

    expect(position.top + card.height).toBeLessThanOrEqual(box.top)
    expect(inside(position)).toBe(true)
    expect(overlaps(position, box)).toBe(false)
  })

  it('目标占满整列高度时放到左右两侧', () => {
    const box = { left: 16, top: 70, width: 480, height: 720 }
    const position = cardPosition(box, card, viewport, 'bottom')

    expect(position.left).toBeGreaterThanOrEqual(box.left + box.width)
    expect(inside(position)).toBe(true)
    expect(overlaps(position, box)).toBe(false)
  })

  it('四周都放不下时贴着视口下沿，仍在屏幕内', () => {
    const box = { left: 4, top: 4, width: 1272, height: 792 }
    const position = cardPosition(box, card, viewport, 'bottom')

    expect(position).toEqual({ left: 470, top: 588 })
    expect(inside(position)).toBe(true)
  })

  it('手机宽度下卡片不会超出屏幕', () => {
    const phone = { width: 390, height: 844 }
    const position = cardPosition(
      { left: 16, top: 300, width: 358, height: 60 },
      { width: 340, height: 200 },
      phone,
      'bottom',
    )

    expect(position.left).toBeGreaterThanOrEqual(12)
    expect(position.left + 340).toBeLessThanOrEqual(phone.width - 12)
  })
})

describe('sameBox', () => {
  it('位置相差不到半个像素算同一个', () => {
    const box = { left: 10, top: 20, width: 100, height: 50 }
    expect(sameBox(box, { ...box, left: 10.3 })).toBe(true)
    expect(sameBox(box, { ...box, left: 11 })).toBe(false)
    expect(sameBox(null, null)).toBe(true)
    expect(sameBox(box, null)).toBe(false)
  })
})

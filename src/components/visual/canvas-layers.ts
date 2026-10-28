'use client'

/**
 * 背景动效分两层：底层画在内容下面（点阵、网格、粒子），光标层画在内容上面
 * （准星、高亮、连线），这样光标移到面板上时效果依然可见。两层都不拦截指针事件。
 */
export interface CanvasLayer {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

export function getLayer(canvas: HTMLCanvasElement | null): CanvasLayer | null {
  const ctx = canvas?.getContext('2d')
  return canvas && ctx ? { canvas, ctx } : null
}

export function fitLayers(layers: CanvasLayer[]): { width: number; height: number } {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const width = window.innerWidth
  const height = window.innerHeight
  for (const { canvas, ctx } of layers) {
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }
  return { width, height }
}

export const BASE_LAYER_CLASS = 'pointer-events-none fixed inset-0 -z-10 h-full w-full'
/** 光标层位于内容之上、弹窗（z-50）之下。 */
export const CURSOR_LAYER_CLASS = 'pointer-events-none fixed inset-0 z-40 h-full w-full'

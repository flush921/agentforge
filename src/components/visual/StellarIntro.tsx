'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * 星辰风格的首屏：一行标语 + 星系两侧的「Agent / Forge」，星辰本身由 StellarField 绘制。
 * 其他风格下由 CSS 隐藏（`[data-theme='stellar']` 才显示），所以服务端照常输出、首屏不跳动。
 * 滚动进度写入 `--p`，文字随之上移淡出。
 */

const FORMATION_CAPTIONS = [
  { id: 'galaxy', mark: '01', text: '星系 · 一句话里，藏着无数种可能' },
  { id: 'glyph', mark: '02', text: 'Ad Astra · 我们的队名，意为「向群星」' },
  { id: 'constellation', mark: '03', text: '星座 · 子 Agent 按需连成编排' },
]

// 字母依次亮起的顺序与延迟（毫秒），刻意打乱，像星星一颗颗点亮。
// 与星空同时在 1.5 秒左右亮起，约 0.6 秒内按打乱的顺序全部出现（参照参考视频的节奏）。
const LEFT = [
  ['A', 1700],
  ['g', 1560],
  ['e', 1820],
  ['n', 1640],
  ['t', 1500],
] as const
const RIGHT = [
  ['F', 1540],
  ['o', 1760],
  ['r', 1600],
  ['g', 1860],
  ['e', 1680],
] as const

function Word({ letters }: { letters: ReadonlyArray<readonly [string, number]> }) {
  return (
    <>
      <span>
        {letters.map(([char, delay], index) => (
          <span
            key={index}
            className="stellar-letter"
            style={{ animationDelay: `${delay}ms` } as CSSProperties}
          >
            {char}
          </span>
        ))}
      </span>
    </>
  )
}

export function StellarIntro() {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const element = ref.current
    if (element === null) return
    let frame = 0
    function update() {
      frame = 0
      const progress = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.7)))
      element!.style.setProperty('--p', progress.toFixed(3))
    }
    function onScroll() {
      if (frame === 0) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <section
      ref={ref}
      aria-label="AgentForge 首屏"
      className="stellar-intro relative h-[calc(100svh-4rem)] min-h-[520px] overflow-hidden"
    >
      <div className="stellar-intro-fade pointer-events-none absolute inset-0">
        <p className="stellar-tagline absolute inset-x-0 top-[9%] px-6 text-center text-base tracking-[0.42em] text-text-secondary sm:text-xl">
          万千星辰，构成你的专属 Agent
        </p>

        <p
          aria-hidden
          className="stellar-word absolute left-1/2 top-[19%] -translate-x-1/2 text-5xl font-medium tracking-tight text-text-primary sm:left-[9%] sm:top-1/2 sm:-translate-x-0 sm:-translate-y-1/2 sm:text-6xl lg:text-7xl"
        >
          <Word letters={LEFT} />
        </p>
        <p
          aria-hidden
          className="stellar-word absolute bottom-[22%] left-1/2 -translate-x-1/2 text-5xl font-medium tracking-tight text-text-primary sm:bottom-auto sm:left-auto sm:right-[9%] sm:top-1/2 sm:-translate-y-1/2 sm:translate-x-0 sm:text-6xl lg:text-7xl"
        >
          <Word letters={RIGHT} />
        </p>

        <div
          aria-hidden
          className="stellar-late absolute inset-x-0 bottom-[16%] h-6 px-4 text-center font-mono text-[11px] tracking-[0.2em] text-text-secondary sm:text-xs xl:inset-x-auto xl:bottom-[6%] xl:left-[5%] xl:px-0 xl:text-left xl:text-sm"
        >
          {FORMATION_CAPTIONS.map((caption) => (
            <span
              key={caption.id}
              data-caption={caption.id}
              className="stellar-caption absolute inset-x-0 whitespace-nowrap xl:inset-x-auto xl:left-0"
            >
              <span className="text-brand">{caption.mark}</span> · {caption.text}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          window.scrollTo({
            top: window.innerHeight * 0.92,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'auto'
              : 'smooth',
          })
        }
        className="stellar-intro-fade absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 rounded-full px-4 py-2 text-xs tracking-[0.3em] text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="stellar-late flex flex-col items-center gap-1">
          向下滚动 · 开始创造
          <ChevronDown className="stellar-bounce size-4" aria-hidden />
        </span>
      </button>
    </section>
  )
}

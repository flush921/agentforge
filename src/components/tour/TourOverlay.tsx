'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MousePointerClick } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cardPosition, sameBox, SPOT_PAD, type Box, type Size } from '@/lib/tour/layout'
import {
  getTourStep,
  stepAfterNavigation,
  stepAfterWelcome,
  TOUR_ASSISTANT_ID,
  TOUR_STEPS,
  tourPageHref,
  tourPageOf,
} from '@/lib/tour/steps'
import { useRunStore } from '@/stores/run-store'
import { useTourStore } from '@/stores/tour-store'

const CARD_WIDTH = 340
const NODE_DRAWER = '[data-tour="node-drawer"]'

/** 第一个当前在屏幕上的目标元素的位置（裁到视口内）；都不在屏幕上时返回 null。 */
function visibleBox(selectors: readonly string[]): Box | null {
  for (const selector of selectors) {
    const element = document.querySelector(selector)
    if (element === null) continue
    const rect = element.getBoundingClientRect()
    const left = Math.max(rect.left, 4)
    const top = Math.max(rect.top, 4)
    const right = Math.min(rect.right, window.innerWidth - 4)
    const bottom = Math.min(rect.bottom, window.innerHeight - 4)
    if (rect.width > 0 && rect.height > 0 && right > left && bottom > top) {
      return { left, top, width: right - left, height: bottom - top }
    }
  }
  return null
}

/**
 * 新手教程浮层：高亮当前要看或要点的元素，旁边放一张说明卡片。
 * 浮层本身不拦截点击（pointer-events: none），用户照常操作页面；
 * 需要亲手操作的步骤靠观察页面状态推进：路径变了、任务跑完了、节点详情打开又关上了。
 */
export function TourOverlay() {
  const pathname = usePathname()
  const router = useRouter()
  const status = useTourStore((store) => store.status)
  const stepId = useTourStore((store) => store.step)
  const goTo = useTourStore((store) => store.goTo)
  const next = useTourStore((store) => store.next)
  const finish = useTourStore((store) => store.finish)
  const runPhase = useRunStore((store) => store.phase)
  const runAssistantId = useRunStore((store) => store.state.assistantId)

  const active = status === 'active'
  const step = getTourStep(stepId)
  const stepNumber = TOUR_STEPS.findIndex((item) => item.id === stepId) + 1
  const page = tourPageOf(pathname)
  const onPage = step.anyPage === true || step.page === page
  // 只认当前工作台自己的运行；在别的 Agent 那里跑过的任务不算。
  const workspaceId = page === 'workspace' ? decodeURIComponent(pathname.split('/')[2] ?? '') : null
  const ownRun = workspaceId !== null && runAssistantId === workspaceId
  const running = ownRun && (runPhase === 'running' || runPhase === 'awaiting_confirm')

  const [box, setBox] = useState<Box | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [cardSize, setCardSize] = useState<Size>({ width: CARD_WIDTH, height: 220 })
  const [viewport, setViewport] = useState<Size>({ width: 1280, height: 800 })
  const cardRef = useRef<HTMLDivElement>(null)
  const drawerSeen = useRef(false)

  // 用户自己走到了后面步骤所在的页面（比如点开了示例 Agent），教程跟着前进。
  useEffect(() => {
    if (!active) return
    const jump = stepAfterNavigation(stepId, page)
    if (jump !== null) goTo(jump)
  }, [active, stepId, page, goTo])

  // 「先问一个简单问题」：这个工作台的任务跑完后进入下一步。
  useEffect(() => {
    if (active && stepId === 'simple' && ownRun && runPhase === 'done') goTo('canvas')
  }, [active, stepId, ownRun, runPhase, goTo])

  // 每帧跟踪目标元素的位置（画布节点会随镜头移动），并观察节点详情抽屉的开合。
  useEffect(() => {
    if (!active) return
    drawerSeen.current = false
    let frame = 0
    const tick = () => {
      const nextBox = onPage ? visibleBox(step.targets) : null
      setBox((previous) => (sameBox(previous, nextBox) ? previous : nextBox))
      const card = cardRef.current
      if (card !== null) {
        const { offsetWidth: width, offsetHeight: height } = card
        setCardSize((previous) =>
          previous.width === width && previous.height === height ? previous : { width, height },
        )
      }
      const { innerWidth: width, innerHeight: height } = window
      setViewport((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      )
      const open = document.querySelector(NODE_DRAWER) !== null
      setDrawerOpen((previous) => (previous === open ? previous : open))
      if (stepId === 'node') {
        if (open) {
          drawerSeen.current = true
        } else if (drawerSeen.current) {
          // 详情打开过、现在关上了：这一步完成。
          drawerSeen.current = false
          next()
          return
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, onPage, step, stepId, next])

  // 目标在屏幕外时（首页的生成框和示例卡片在首屏下方）先滚过去。
  useEffect(() => {
    if (!active || !onPage || step.scroll === undefined) return
    const timer = setTimeout(() => {
      for (const selector of step.targets) {
        const element = document.querySelector(selector)
        if (element === null) continue
        element.scrollIntoView({
          block: step.scroll,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
        break
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [active, onPage, step])

  // 节点详情打开时让出画面，关闭后再出现。
  if (!active || drawerOpen) return null

  const centered = onPage && step.targets.length === 0
  const position = cardPosition(box, cardSize, viewport, centered ? 'center' : 'bottom')
  const width = Math.min(CARD_WIDTH, viewport.width - 24)

  function startSteps() {
    if (page === 'home' || page === 'workspace') {
      goTo(stepAfterWelcome(page))
    } else {
      goTo('generate')
      router.push('/')
    }
  }

  function advance() {
    if (stepId === 'welcome') {
      startSteps()
    } else if (stepId === 'complex') {
      goTo('demo')
      router.push('/demo')
    } else {
      next()
    }
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {box !== null ? (
        <div
          aria-hidden
          className="tour-spot"
          style={{
            left: box.left - SPOT_PAD,
            top: box.top - SPOT_PAD,
            width: box.width + SPOT_PAD * 2,
            height: box.height + SPOT_PAD * 2,
          }}
        />
      ) : centered ? (
        <div aria-hidden className="absolute inset-0 bg-black/60" />
      ) : null}

      <div
        ref={cardRef}
        role="region"
        aria-label="新手教程"
        aria-live="polite"
        data-tour-card={onPage ? stepId : 'paused'}
        className="tour-card pointer-events-auto absolute rounded-2xl border border-brand/40 bg-panel/95 p-4 text-text-primary shadow-2xl shadow-black/60 backdrop-blur-xl"
        style={{ left: position.left, top: position.top, width }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 font-mono text-[10px] tracking-wider text-brand">
            新手教程 {stepNumber} / {TOUR_STEPS.length}
          </span>
          <button
            type="button"
            onClick={finish}
            className="rounded text-[11px] text-ink-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            跳过教程
          </button>
        </div>

        {onPage ? (
          <>
            <h2 className="mt-3 text-base font-semibold">{step.title}</h2>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-6 text-text-secondary">
              {running && step.whileRunning !== undefined ? step.whileRunning : step.body}
            </p>
            {step.action !== undefined && !running ? (
              <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-brand">
                <MousePointerClick className="size-4 shrink-0" aria-hidden />
                {step.action}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {step.skippable === true && !running ? (
                <Button type="button" variant="ghost" size="sm" onClick={next}>
                  跳过这一步
                </Button>
              ) : null}
              {step.nextLabel !== undefined ? (
                <Button type="button" size="sm" className="glow-button px-3.5" onClick={advance}>
                  {step.nextLabel}
                </Button>
              ) : null}
              {stepId === 'finish' ? (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={finish}>
                    留在这里
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="glow-button px-3.5"
                    onClick={() => {
                      finish()
                      router.push(`/a/${TOUR_ASSISTANT_ID}`)
                    }}
                  >
                    回到工作台试试
                  </Button>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <h2 className="mt-3 text-base font-semibold">教程暂停了</h2>
            <p className="mt-2 text-[13px] leading-6 text-text-secondary">
              教程进行到「{step.title}」，这一步不在当前页面。
            </p>
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                size="sm"
                className="glow-button px-3.5"
                onClick={() => router.push(tourPageHref(step.page))}
              >
                回到教程
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

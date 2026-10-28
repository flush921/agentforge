'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  SHOWCASE_LEVELS,
  SHOWCASE_NODE_RADIUS,
  SHOWCASE_VIEW,
  showcaseEdgePath,
  type ShowcaseFamily,
  type ShowcaseNode,
} from '@/lib/visual/showcase'
import { formatTokens } from '@/lib/canvas/format'
import { cn } from '@/lib/utils'

const CYCLE_MS = 3600
const R = SHOWCASE_NODE_RADIUS

const familyColor: Record<ShowcaseFamily, string> = {
  system: 'var(--brand)',
  gather: 'var(--role-gather)',
  reason: 'var(--role-reason)',
  produce: 'var(--role-produce)',
  review: 'var(--role-review)',
  tool: 'var(--chart-4)',
}

const spring = { type: 'spring', stiffness: 120, damping: 18, mass: 0.9 } as const

function NodeShape({ node }: { node: ShowcaseNode }) {
  const color = familyColor[node.family]
  if (node.family === 'system') {
    return (
      <>
        <rect
          x={-R - 6}
          y={-13}
          width={(R + 6) * 2}
          height={26}
          rx={13}
          className="showcase-pill"
          fill="var(--panel)"
          stroke={color}
          strokeOpacity={0.55}
        />
        <text y={4.5} textAnchor="middle" fontSize={13} fill="var(--text-primary)">
          {node.label}
        </text>
      </>
    )
  }
  if (node.family === 'review') {
    return (
      <>
        <rect
          x={-14}
          y={-14}
          width={28}
          height={28}
          transform="rotate(45)"
          fill="var(--panel)"
          stroke={color}
          strokeWidth={2}
        />
        <text y={R + 20} textAnchor="middle" fontSize={13} fill="var(--text-secondary)">
          {node.label}
        </text>
      </>
    )
  }
  return (
    <>
      <circle r={R + 6} fill={color} opacity={0.14} className="showcase-halo" />
      <circle r={R} fill="var(--panel)" stroke={color} strokeWidth={2} />
      <circle r={5} fill={color} />
      <text y={R + 20} textAnchor="middle" fontSize={13} fill="var(--text-secondary)">
        {node.label}
      </text>
    </>
  )
}

/** 服务端快照为 false、客户端快照为 true：hydration 之后自动切换，不需要在 effect 里 setState。 */
function subscribeNever() {
  return () => {}
}

export function OrchestrationShowcase() {
  // 服务端不知道用户是否开了「减少动效」，首次客户端渲染必须与服务端一致，
  // 否则会出现 hydration 不匹配；挂载之后再按真实偏好切换。
  const systemReduced = useReducedMotion()
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  )
  const reducedMotion = mounted && Boolean(systemReduced)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const current = SHOWCASE_LEVELS[index]!
  const nodeMap = new Map(current.nodes.map((node) => [node.id, node]))

  useEffect(() => {
    if (paused || reducedMotion) return
    const timer = window.setTimeout(
      () => setIndex((value) => (value + 1) % SHOWCASE_LEVELS.length),
      CYCLE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [index, paused, reducedMotion])

  return (
    <div
      className="spotlight glass-panel relative overflow-hidden rounded-3xl p-4 sm:p-5"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-wider text-ink-muted">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-brand" />
          </span>
          ADAPTIVE ORCHESTRATION
        </div>
        <div role="group" aria-label="编排级别" className="flex gap-1">
          {SHOWCASE_LEVELS.map((item, itemIndex) => (
            <button
              key={item.level}
              type="button"
              aria-pressed={itemIndex === index}
              onClick={() => setIndex(itemIndex)}
              className={cn(
                'relative rounded-md px-2 py-1 font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                itemIndex === index
                  ? 'text-primary-foreground'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {itemIndex === index ? (
                <motion.span
                  layoutId="showcase-level"
                  transition={reducedMotion ? { duration: 0 } : spring}
                  className="absolute inset-0 rounded-md bg-brand shadow-[0_0_16px_var(--brand)]"
                />
              ) : null}
              <span className="relative">L{item.level}</span>
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${SHOWCASE_VIEW.width} ${SHOWCASE_VIEW.height}`}
        className="mt-2 h-auto w-full"
        role="img"
        aria-label={`L${current.level} ${current.label}：${current.summary}，调度 ${current.agents} 个子 Agent`}
      >
        <defs>
          <filter id="showcase-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <AnimatePresence>
          {current.edges.map((edge) => {
            const from = nodeMap.get(edge.from)!
            const to = nodeMap.get(edge.to)!
            const d = showcaseEdgePath(from, to, edge.kind)
            const stroke =
              edge.kind === 'feedback'
                ? 'var(--warning)'
                : edge.kind === 'tool'
                  ? 'var(--chart-4)'
                  : 'var(--brand)'
            return (
              <motion.g
                key={edge.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.35 }}
              >
                <motion.path
                  initial={false}
                  animate={{ d }}
                  transition={reducedMotion ? { duration: 0 } : spring}
                  fill="none"
                  stroke={stroke}
                  strokeOpacity={0.35}
                  strokeWidth={1.5}
                  strokeDasharray={edge.kind === 'flow' ? undefined : '5 4'}
                />
                {reducedMotion ? null : (
                  <circle
                    key={`${current.level}-${edge.id}`}
                    r={2.6}
                    fill={stroke}
                    filter="url(#showcase-glow)"
                  >
                    <animateMotion
                      dur={edge.kind === 'flow' ? '1.8s' : '1.2s'}
                      repeatCount="indefinite"
                      path={d}
                      begin={`${(edge.id.length % 5) * 0.23}s`}
                    />
                  </circle>
                )}
              </motion.g>
            )
          })}
        </AnimatePresence>

        <AnimatePresence>
          {current.nodes.map((node) => (
            <motion.g
              key={node.id}
              initial={reducedMotion ? false : { opacity: 0, scale: 0.4, x: node.x, y: node.y }}
              animate={{ opacity: 1, scale: 1, x: node.x, y: node.y }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={reducedMotion ? { duration: 0 } : spring}
            >
              <NodeShape node={node} />
            </motion.g>
          ))}
        </AnimatePresence>
      </svg>

      <div className="mt-1 grid gap-3 border-t border-white/5 pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div aria-live="polite" className="min-h-10">
          <p className="text-sm font-medium text-text-primary">
            <span className="font-mono text-brand">L{current.level}</span> · {current.label}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-text-secondary">{current.summary}</p>
        </div>
        <dl className="flex gap-5 text-[11px]">
          <div className="flex flex-col-reverse">
            <dt className="text-ink-muted">子 Agent</dt>
            <dd className="font-mono text-lg leading-6 text-text-primary">×{current.agents}</dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="text-ink-muted">Token 预算</dt>
            <dd className="font-mono text-lg leading-6 text-text-primary">
              {formatTokens(current.budget)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

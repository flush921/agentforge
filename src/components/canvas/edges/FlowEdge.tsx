'use client'

import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useViewport,
  type EdgeProps,
} from '@xyflow/react'
import { useReducedMotion } from 'motion/react'
import type { CanvasFlowEdge } from '../types'

function FlowEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<CanvasFlowEdge>) {
  const reducedMotion = useReducedMotion()
  const { zoom } = useViewport()
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })
  const active = data?.active ?? false
  const done = data?.done ?? false
  const kind = data?.kind ?? 'flow'
  const color = data?.color ?? 'var(--edge)'
  const pick = data?.pick
  const label = kind === 'feedback' ? '返工意见' : kind === 'fallback' ? '降级' : undefined
  const horizontal = Math.abs(targetX - sourceX) >= Math.abs(targetY - sourceY)
  const labelOffset = horizontal ? -48 / Math.max(zoom, 0.01) : 0

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          // 返工虚线在缩小时按比例加粗，保证全览里仍能看清返工回路。
          // 择优采用的一路加粗发光，其余各路变成暗淡虚线。
          strokeWidth:
            kind === 'feedback'
              ? Math.min(3.5, 2 / Math.max(zoom, 0.01))
              : pick === 'picked'
                ? 2.5
                : active
                  ? 2
                  : 1.5,
          strokeOpacity:
            pick === 'picked'
              ? 1
              : pick === 'unpicked'
                ? 0.3
                : active || kind === 'feedback'
                  ? 1
                  : done
                    ? 0.45
                    : 1,
          strokeDasharray: kind === 'flow' && pick !== 'unpicked' ? undefined : '6 4',
          filter: active
            ? 'drop-shadow(0 0 3px var(--brand))'
            : pick === 'picked'
              ? 'drop-shadow(0 0 4px var(--ultra))'
              : undefined,
        }}
      />
      {active && !reducedMotion ? (
        <>
          <circle r="3" fill="var(--brand)" style={{ filter: 'drop-shadow(0 0 4px var(--brand))' }}>
            <animateMotion dur="1.6s" repeatCount="indefinite" path={path} begin="0s" />
          </circle>
          <circle r="3" fill="var(--brand)" style={{ filter: 'drop-shadow(0 0 4px var(--brand))' }}>
            <animateMotion dur="1.6s" repeatCount="indefinite" path={path} begin="0.8s" />
          </circle>
        </>
      ) : null}
      {label !== undefined ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + labelOffset}px)`,
            }}
          >
            <div
              className="rounded-md border border-border bg-panel px-2 py-1 text-[12px] font-medium whitespace-nowrap shadow-sm"
              style={{
                color: kind === 'feedback' ? 'var(--warning)' : 'var(--ink-muted)',
                transform: `scale(${1 / Math.max(zoom, 0.01)})`,
              }}
            >
              {label}
            </div>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

export const FlowEdge = memo(FlowEdgeView, (previous, next) => {
  const a = previous.data
  const b = next.data
  return (
    previous.sourceX === next.sourceX &&
    previous.sourceY === next.sourceY &&
    previous.targetX === next.targetX &&
    previous.targetY === next.targetY &&
    previous.sourcePosition === next.sourcePosition &&
    previous.targetPosition === next.targetPosition &&
    previous.markerEnd === next.markerEnd &&
    a?.active === b?.active &&
    a?.done === b?.done &&
    a?.kind === b?.kind &&
    a?.color === b?.color &&
    a?.pick === b?.pick
  )
})

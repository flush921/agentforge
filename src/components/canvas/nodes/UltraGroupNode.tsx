'use client'

import { memo } from 'react'
import { Zap } from 'lucide-react'
import type { NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import type { UltraGroupFlowNode } from '../types'

/** Ultra 环节框：把同一环节的多路 Agent、多路择优和方向校准框在一起。 */
function UltraGroupNodeView({ data }: NodeProps<UltraGroupFlowNode>) {
  return (
    <div
      aria-hidden
      data-ultra-group={data.group}
      data-status={data.status}
      style={{ width: data.width, height: data.height }}
      className={cn(
        'ultra-group pointer-events-none rounded-[20px] border border-dashed border-ultra/25',
        data.status === 'running' && 'ultra-group-live border-ultra/55',
        data.status === 'completed' && 'border-ultra/35',
      )}
    >
      <span className="flex h-[26px] items-center gap-1.5 px-3 text-[11px] font-medium text-ultra/85">
        <Zap className="size-3" aria-hidden />
        <span className="truncate">{data.title}</span>
        <span className="font-mono text-[10px] text-ink-muted">· {data.lanes} 路</span>
      </span>
    </div>
  )
}

export const UltraGroupNode = memo(
  UltraGroupNodeView,
  (previous, next) =>
    previous.data.status === next.data.status &&
    previous.data.width === next.data.width &&
    previous.data.height === next.data.height &&
    previous.data.title === next.data.title &&
    previous.data.lanes === next.data.lanes,
)

'use client'

import type { ReactNode } from 'react'
import { Check, Wrench, X } from 'lucide-react'
import { Markdown } from '@/components/markdown/Markdown'
import { formatTokens, roleInfo } from '@/lib/canvas/format'
import type { RunState } from '@/lib/run/types'
import { cn } from '@/lib/utils'
import { roleIcons } from '../canvas/role-icons'
import { nodeStatusLabel } from '../canvas/nodes/shared'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold tracking-wider text-text-secondary">{title}</h3>
      {children}
    </section>
  )
}

export function NodeDrawer({
  state,
  nodeId,
  onClose,
}: {
  state: RunState
  nodeId: string | null
  onClose: () => void
}) {
  const nodeState = nodeId === null ? undefined : state.nodes[nodeId]
  const info = nodeState === undefined ? undefined : roleInfo(nodeState.node.role)
  const Icon = nodeState === undefined ? undefined : roleIcons[nodeState.node.role]

  return (
    <Sheet
      open={nodeState !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        className="w-full gap-0 overflow-y-auto border-border bg-panel p-0 sm:max-w-md"
        showCloseButton
      >
        {nodeState !== undefined && info !== undefined && Icon !== undefined ? (
          <>
            <SheetHeader className="border-b border-border p-5 pr-12">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-background">
                  <Icon className="size-5 text-brand" aria-hidden />
                </span>
                <div>
                  <SheetTitle className="text-base">{nodeState.node.title}</SheetTitle>
                  <SheetDescription className="mt-1">
                    {info.label} · {nodeStatusLabel[nodeState.status]} ·{' '}
                    {nodeState.attempt === 0 ? '尚未启动' : `第 ${nodeState.attempt} 次尝试`}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div className="space-y-6 p-5 text-sm">
              <DrawerSection title="指令">
                <p className="leading-6 text-text-primary">{nodeState.node.instruction}</p>
              </DrawerSection>
              <DrawerSection title="材料来源">
                {nodeState.node.dependsOn.length === 0 ? (
                  <p className="text-text-secondary">用户任务与系统入口</p>
                ) : (
                  <ul className="space-y-1.5">
                    {nodeState.node.dependsOn.map((id) => (
                      <li
                        key={id}
                        className="rounded-lg border border-border/70 bg-background/45 px-3 py-2 text-text-secondary"
                      >
                        {state.nodes[id]?.node.title ?? id}
                      </li>
                    ))}
                  </ul>
                )}
              </DrawerSection>
              <DrawerSection title={`工具调用时间线（${nodeState.toolCalls.length}）`}>
                {nodeState.toolCalls.length === 0 ? (
                  <p className="text-ink-muted">本环节没有工具调用。</p>
                ) : (
                  <ol className="space-y-2">
                    {nodeState.toolCalls.map((call) => (
                      <li
                        key={call.callId}
                        className="rounded-lg border border-border/70 bg-background/45 p-3"
                      >
                        <div className="flex items-center gap-2 font-mono text-xs">
                          <Wrench className="size-3.5 text-brand" aria-hidden />
                          <span>{call.tool}</span>
                          {call.ok === undefined ? (
                            <span className="ml-auto text-warning">调用中</span>
                          ) : call.ok ? (
                            <Check className="ml-auto size-4 text-success" aria-label="成功" />
                          ) : (
                            <X className="ml-auto size-4 text-danger" aria-label="失败" />
                          )}
                        </div>
                        <pre className="mt-2 overflow-x-auto text-[11px] whitespace-pre-wrap text-text-secondary">
                          {JSON.stringify(call.input)}
                        </pre>
                        {call.summary !== undefined ? (
                          <p className="mt-2 text-xs leading-5 text-text-secondary">
                            {call.summary}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </DrawerSection>
              {nodeState.reasoning.length > 0 ? (
                <DrawerSection title="思考过程">
                  <details className="rounded-lg border border-border/70 bg-background/45 px-3 py-2">
                    <summary className="cursor-pointer text-xs text-text-secondary">
                      展开思考记录
                    </summary>
                    <p className="mt-3 text-xs leading-6 whitespace-pre-wrap text-text-secondary">
                      {nodeState.reasoning}
                    </p>
                  </details>
                </DrawerSection>
              ) : null}
              <DrawerSection title="产出">
                <div className="max-h-80 overflow-y-auto rounded-lg border border-border/70 bg-background/45 p-3 text-xs leading-6 text-text-primary">
                  <Markdown>
                    {nodeState.output ??
                      (nodeState.text.length > 0 ? nodeState.text : '尚未产生内容')}
                  </Markdown>
                </div>
              </DrawerSection>
              {nodeState.review !== undefined ? (
                <DrawerSection title="审校意见">
                  <p
                    className={cn(
                      'font-medium',
                      nodeState.review.verdict === 'pass' ? 'text-success' : 'text-warning',
                    )}
                  >
                    {nodeState.review.verdict === 'pass'
                      ? '✓ 通过'
                      : `✗ 打回 ${nodeState.review.issues.length} 条`}
                  </p>
                  <ol className="list-decimal space-y-2 pl-5 text-xs leading-5 text-text-secondary">
                    {nodeState.review.issues.map((issue, index) => (
                      <li key={`${index}-${issue}`}>{issue}</li>
                    ))}
                  </ol>
                </DrawerSection>
              ) : null}
              {nodeState.usage !== undefined ? (
                <DrawerSection title="Usage">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-background/50 p-3">
                      <div className="font-mono">{formatTokens(nodeState.usage.inputTokens)}</div>
                      <div className="mt-1 text-[10px] text-text-secondary">输入</div>
                    </div>
                    <div className="rounded-lg bg-background/50 p-3">
                      <div className="font-mono">{formatTokens(nodeState.usage.outputTokens)}</div>
                      <div className="mt-1 text-[10px] text-text-secondary">输出</div>
                    </div>
                    <div className="rounded-lg bg-background/50 p-3">
                      <div className="font-mono">
                        {formatTokens(nodeState.usage.inputTokens + nodeState.usage.outputTokens)}
                      </div>
                      <div className="mt-1 text-[10px] text-text-secondary">合计</div>
                    </div>
                  </div>
                </DrawerSection>
              ) : null}
              {nodeState.error !== undefined ? (
                <DrawerSection title="错误信息">
                  <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-danger">
                    {nodeState.error.code}：{nodeState.error.message}
                  </p>
                </DrawerSection>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

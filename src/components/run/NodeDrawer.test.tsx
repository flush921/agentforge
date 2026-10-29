import type { PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { RunEvent, RunEventBody } from '@/lib/contracts/events'
import { validPlans } from '@/lib/fixtures/plans'
import { sampleRunL4 } from '@/lib/fixtures/runs'
import { reduceEvents } from '@/lib/run/reducer'
import { NodeDrawer } from './NodeDrawer'

vi.mock('@/components/ui/sheet', () => {
  function Wrapper({ children }: PropsWithChildren) {
    return <div>{children}</div>
  }
  return {
    Sheet: Wrapper,
    SheetContent: Wrapper,
    SheetDescription: Wrapper,
    SheetHeader: Wrapper,
    SheetTitle: Wrapper,
  }
})

describe('NodeDrawer', () => {
  it('产出渲染 Markdown，思考过程保留纯文本', () => {
    const base = reduceEvents(sampleRunL4)
    const node = base.nodes.writer_r1!
    const state = {
      ...base,
      nodes: {
        ...base.nodes,
        writer_r1: {
          ...node,
          output: '## 报告标题\n\n**重点内容**\n\n<script>alert(1)</script>',
          reasoning: '**思考记录**',
        },
      },
    }
    const html = renderToStaticMarkup(
      <NodeDrawer state={state} nodeId="writer_r1" onClose={() => {}} />,
    )

    expect(html).toContain('<h2>报告标题</h2>')
    expect(html).toContain('<strong>重点内容</strong>')
    expect(html).toContain('**思考记录**')
    expect(html).not.toContain('<strong>思考记录</strong>')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('校准节点的材料来源是被采用的那一路；择优与校准不显示工具调用栏', () => {
    const plan = structuredClone(validPlans[4])
    const bodies: RunEventBody[] = [
      {
        type: 'run.started',
        runId: 'r',
        assistantId: 'a',
        task: '任务',
        intensity: 0.5,
        ultra: true,
      },
      { type: 'plan.started', level: 4 },
      { type: 'plan.completed', plan, source: 'planner', budget: 1 },
      { type: 'node.started', nodeId: 'research_a_uj', attempt: 1 },
      {
        type: 'node.judge',
        nodeId: 'research_a_uj',
        result: { winner: 'depth', walkover: true, reason: '直接采用' },
      },
    ]
    const state = reduceEvents(bodies.map((body, seq) => ({ ...body, seq, t: seq }) as RunEvent))

    const aligner = renderToStaticMarkup(
      <NodeDrawer state={state} nodeId="research_a" onClose={() => {}} />,
    )
    expect(aligner).toContain('深度·现状调研')
    expect(aligner).not.toContain('择优·现状调研')
    expect(aligner).not.toContain('工具调用时间线')

    const judge = renderToStaticMarkup(
      <NodeDrawer state={state} nodeId="research_a_uj" onClose={() => {}} />,
    )
    expect(judge).toContain('严谨·现状调研')
    expect(judge).not.toContain('工具调用时间线')

    const lane = renderToStaticMarkup(
      <NodeDrawer state={state} nodeId="research_a_u1" onClose={() => {}} />,
    )
    expect(lane).toContain('工具调用时间线')
  })
})

import type { PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
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
})

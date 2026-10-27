import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LevelDecision } from '@/lib/contracts/plan'
import { sampleRunL0 } from '@/lib/fixtures/runs'
import { reduceEvents } from '@/lib/run/reducer'
import { RunHeader } from './RunHeader'

function renderDecision(decision: LevelDecision): string {
  const state = { ...reduceEvents(sampleRunL0), decision }
  return renderToStaticMarkup(<RunHeader state={state} />)
}

describe('RunHeader 定级说明', () => {
  it('upgraded 时说明需要工具并按 L1 执行', () => {
    const html = renderDecision({
      rawScore: 1,
      adjustment: 0,
      score: 1,
      level: 1,
      downgraded: false,
      upgraded: true,
    })
    expect(html).toContain('需要工具，按 L1 执行')
    expect(html).toContain('text-ink-muted')
  })

  it('downgraded 时说明无需工具并按 L0 执行', () => {
    const html = renderDecision({
      rawScore: 2,
      adjustment: 0,
      score: 2,
      level: 0,
      downgraded: true,
    })
    expect(html).toContain('无需工具，按 L0 执行')
    expect(html).not.toContain('需要工具，按 L1 执行')
  })

  it('旧记录缺失 upgraded 时按 false 展示', () => {
    const html = renderDecision({
      rawScore: 0,
      adjustment: 0,
      score: 0,
      level: 0,
      downgraded: false,
    })
    expect(html).not.toContain('需要工具，按 L1 执行')
    expect(html).not.toContain('无需工具，按 L0 执行')
  })
})

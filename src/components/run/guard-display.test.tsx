import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConversationPanel } from '@/components/workspace/ConversationPanel'
import type { RunEvent } from '@/lib/contracts/events'
import type { ComplexityAssessment } from '@/lib/contracts/plan'
import { reduceEvents } from '@/lib/run/reducer'
import type { RunState } from '@/lib/run/types'
import { testAssistant } from '@/test/fixtures'
import { RunHeader } from './RunHeader'

function guardedState(kind: 'crisis' | 'policy'): RunState {
  const reason = kind === 'crisis' ? '检测到可能的心理危机信号' : '涉及违规或危险内容'
  const assessment: ComplexityAssessment = {
    dims: { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 },
    rationale: reason,
    source: kind === 'crisis' ? 'rule' : 'llm',
    guard: { blocked: true, kind, reason },
  }
  const events: RunEvent[] = [
    {
      seq: 0,
      t: 0,
      type: 'run.started',
      runId: `run-${kind}`,
      assistantId: testAssistant.id,
      task: '测试任务',
      intensity: 0.5,
    },
    { seq: 1, t: 1, type: 'assess.started' },
    {
      seq: 2,
      t: 2,
      type: 'assess.completed',
      assessment,
      decision: { rawScore: 0, adjustment: 0, score: 0, level: 0, downgraded: false },
    },
    {
      seq: 3,
      t: 3,
      type: 'run.completed',
      output: '安全响应',
      degraded: false,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 3,
      warnings: ['已按安全护栏拒绝执行'],
    },
  ]
  return {
    ...reduceEvents(events),
    budget: { limit: 1000, used: 100, exceeded: false },
  }
}

function conversation(state: RunState): string {
  return renderToStaticMarkup(
    <ConversationPanel
      assistant={testAssistant}
      sessions={[{ id: 1, task: '测试任务', intensity: 0.5 }]}
      state={state}
      phase="done"
      running={false}
      onPickStarter={() => {}}
      onConfirm={() => {}}
      onRetry={() => {}}
    />,
  )
}

describe('guard 展示', () => {
  it('crisis RunHeader 显示我们在这里并隐藏级别、数量、预算、得分及警告', () => {
    const state = guardedState('crisis')
    const html = renderToStaticMarkup(<RunHeader state={state} />)

    expect(html).toContain('我们在这里')
    expect(html).not.toContain('L0')
    expect(html).not.toContain('子 Agent')
    expect(html).not.toContain('Token 预算')
    expect(html).not.toContain('得分')
    expect(html).not.toContain('运行警告')
    expect(state.warnings).toEqual(['已按安全护栏拒绝执行'])
  })

  it('policy RunHeader 显示安全拦截并保留警告、隐藏得分', () => {
    const html = renderToStaticMarkup(<RunHeader state={guardedState('policy')} />)

    expect(html).toContain('安全拦截')
    expect(html).toContain('运行警告')
    expect(html).not.toContain('L0')
    expect(html).not.toContain('子 Agent')
    expect(html).not.toContain('Token 预算')
    expect(html).not.toContain('得分')
  })

  it('crisis 对话区使用 brand 横幅且状态行不重复显示 chip', () => {
    const html = conversation(guardedState('crisis'))

    expect(html).toContain('data-guard-kind="crisis"')
    expect(html.match(/我们在这里/g)).toHaveLength(1)
    expect(html).toContain('text-brand')
    expect(html).not.toContain('安全护栏已拦截')
    expect(html).not.toContain('运行警告')
    expect(html).not.toContain('L0')
    expect(html).not.toContain('子 Agent')
  })

  it('policy 对话区显示安全拦截和警告', () => {
    const html = conversation(guardedState('policy'))

    expect(html).toContain('data-guard-kind="policy"')
    expect(html).toContain('安全拦截')
    expect(html).toContain('安全护栏已拦截')
    expect(html).toContain('运行警告')
    expect(html).not.toContain('我们在这里')
    expect(html).not.toContain('L0')
    expect(html).not.toContain('子 Agent')
  })
})

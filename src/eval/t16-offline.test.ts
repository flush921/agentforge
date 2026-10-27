import { describe, expect, it } from 'vitest'
import type { Level } from '@/lib/contracts/common'
import type { ComplexityAssessment } from '@/lib/contracts/plan'
import type { RouteEvalResult, RouteEvaluationArtifact } from './route-eval-report'
import { buildOfflineRecompute } from './t16-offline'

function round(level: Level, tools: 0 | 1): RouteEvalResult['rounds'][number] {
  const dims: ComplexityAssessment['dims'] = {
    subtasks: 0,
    tools,
    parallel: 0,
    rigor: 0,
    length: 0,
  }
  return {
    round: 1,
    dims,
    rationale: '已保存的历史评估',
    source: 'llm',
    level,
    decision: { rawScore: tools, adjustment: 0, score: tools, level, downgraded: false },
    guard: null,
    durationMs: 1,
    usage: { inputTokens: 1, outputTokens: 1 },
    llmCalls: 1,
  }
}

function artifact(routes: RouteEvalResult[]): RouteEvaluationArtifact {
  return {
    intensity: 0.5,
    assessmentCalls: routes.reduce((sum, item) => sum + item.rounds.length, 0),
    llmCalls: 0,
    startedAt: '2026-10-27T00:00:00.000Z',
    completedAt: '2026-10-27T00:01:00.000Z',
    routes,
    guards: [],
    costSamples: [],
  }
}

describe('buildOfflineRecompute', () => {
  it('只用已保存 dims 复算工具下限并保留原始 raw', () => {
    const raw = artifact([
      {
        id: 'calc',
        presetId: 'preset-data',
        task: '计算题',
        expected: [1],
        rounds: [round(0, 1), { ...round(0, 1), round: 2 }],
      },
      {
        id: 'fact',
        presetId: 'preset-data',
        task: '概念题',
        expected: [0],
        rounds: [round(0, 0), { ...round(0, 0), round: 2 }],
      },
    ])
    const report = buildOfflineRecompute([{ label: '合成历史集', raw }])

    expect(report).toContain('| 合成历史集 | 50.0% → 100.0% | 50.0% → 0.0% |')
    expect(report).toContain('| 合成历史集 | calc | 1 | L1 | L0 → L1 | 1 |')
    expect(report).toContain('| 合成历史集 | calc | 2 | L1 | L0 → L1 | 1 |')
    expect(report).toContain('不作为证据')
    expect(raw.routes[0]!.rounds[0]!.level).toBe(0)
    expect(raw.routes[0]!.rounds[0]!.decision.upgraded).toBeUndefined()
  })

  it('tools=0 时不触发升级', () => {
    const raw = artifact([
      {
        id: 'fact',
        presetId: 'preset-data',
        task: '概念题',
        expected: [0],
        rounds: [round(0, 0), { ...round(0, 0), round: 2 }],
      },
    ])
    const report = buildOfflineRecompute([{ label: '无升级', raw }])
    expect(report).toContain('没有触发工具下限的轮次')
    expect(report).toContain('100.0% → 100.0%')
  })
})

import { describe, expect, it } from 'vitest'
import type { Level } from '@/lib/contracts/common'
import type { RouteEvaluationArtifact, AssessmentRound } from './route-eval-report'
import { buildRouteReport } from './route-eval-report'

function round(
  level: Level,
  source: AssessmentRound['source'] = 'llm',
  guard: AssessmentRound['guard'] = null,
): AssessmentRound {
  return {
    round: 1,
    dims: { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 },
    rationale: `${source} 评估理由`,
    source,
    level,
    decision: { rawScore: 0, adjustment: 0, score: 0, level, downgraded: false },
    guard,
    durationMs: 10,
    usage: { inputTokens: 100, outputTokens: 50 },
    llmCalls: source === 'rule' ? 0 : 1,
  }
}

function artifact(
  routes: RouteEvaluationArtifact['routes'],
  guards: RouteEvaluationArtifact['guards'],
  costSamples: RouteEvaluationArtifact['costSamples'],
): RouteEvaluationArtifact {
  const all = [...routes, ...guards]
  return {
    intensity: 0.5,
    assessmentCalls: all.reduce((sum, item) => sum + item.rounds.length, 0),
    llmCalls: all.reduce(
      (sum, item) => sum + item.rounds.reduce((count, result) => count + result.llmCalls, 0),
      0,
    ),
    startedAt: '2026-10-27T00:00:00.000Z',
    completedAt: '2026-10-27T00:01:00.000Z',
    routes,
    guards,
    costSamples,
  }
}

describe('buildRouteReport', () => {
  it('列出全部错判、误拦、漏拦和 fallback，缺成本样本时不计算节省比例', () => {
    const report = buildRouteReport(
      artifact(
        [
          {
            id: 'k1',
            presetId: 'preset-kaoyan',
            task: '正确题',
            expected: [0],
            rounds: [round(0), { ...round(0), round: 2 }],
          },
          {
            id: 'k2',
            presetId: 'preset-kaoyan',
            task: '错判题',
            expected: [4],
            rounds: [round(1), { ...round(3, 'fallback'), round: 2 }],
          },
        ],
        [
          {
            id: 'g1',
            presetId: 'preset-kaoyan',
            task: '应拦截',
            shouldBlock: true,
            kind: 'policy',
            rounds: [round(0, 'llm', { blocked: true, kind: 'policy', reason: '违规' })],
          },
          {
            id: 'g2',
            presetId: 'preset-diet',
            task: '误拦题',
            shouldBlock: false,
            rounds: [round(0, 'llm', { blocked: true, kind: 'topic', reason: '误判' })],
          },
          {
            id: 'g3',
            presetId: 'preset-diet',
            task: '漏拦题',
            shouldBlock: true,
            kind: 'crisis',
            rounds: [round(0)],
          },
        ],
        [
          { source: 'T11', id: 'l0', level: 0, totalTokens: 10, durationMs: 100 },
          { source: 'T11', id: 'l2', level: 2, totalTokens: 20, durationMs: 200 },
          { source: 'T11', id: 'l3', level: 3, totalTokens: 30, durationMs: 300 },
          { source: 'T11', id: 'l4', level: 4, totalTokens: 40, durationMs: 400 },
        ],
      ),
    )

    expect(report).toContain('| k2 | 错判题 | L4 | L1 | L3 |')
    expect(report).toContain('| g2 | 误拦题 | 否 | — | topic |')
    expect(report).toContain('| g3 | 漏拦题 | 是 | crisis | 未拦截 |')
    expect(report).toContain('fallback 共 1 次（k2 第2轮）')
    expect(report).toContain('N/A（缺 L1 样本）')
    expect(report).toContain('不报告自适应相比一律 L4 的节省比例')
    expect(report).toContain('| accuracy | 50.0% |')
  })

  it('成本样本齐备时按同一轮次计算自适应节省比例', () => {
    const report = buildRouteReport(
      artifact(
        [
          {
            id: 'k1',
            presetId: 'preset-kaoyan',
            task: '简单题',
            expected: [0],
            rounds: [round(0), { ...round(0), round: 2 }],
          },
        ],
        [],
        [
          { source: 'T11', id: 'l0', level: 0, totalTokens: 10, durationMs: 100 },
          { source: 'T13', id: 'l4', level: 4, totalTokens: 40, durationMs: 400 },
        ],
      ),
    )

    expect(report).toContain('自适应相比一律 L4 节省 75.0% token 和 75.0% 耗时')
    expect(report).toContain('| 自适应（按预测级别） | 20 | 200 |')
    expect(report).toContain('| 一律 L4 | 80 | 800 |')
    expect(report).toContain('| 一律 L0 | 20 | 200 |')
  })

  it('按实际成本来源生成 T16 标题与说明', () => {
    const report = buildRouteReport({
      ...artifact(
        [],
        [],
        [{ source: 'T15', id: 'cost-1', level: 1, totalTokens: 100, durationMs: 100 }],
      ),
      evalSet: 'holdout2',
      evalTag: 'holdout2-final',
    })
    expect(report).toContain('# T16 holdout2-final 路由评测报告')
    expect(report).toContain('成本只读取 T15 已有 completed 运行，共 1 条')
  })
})

import { describe, expect, it } from 'vitest'
import type { Level } from '@/lib/contracts/common'
import type { AssessmentRound, RouteEvaluationArtifact, RouteEvalResult } from './route-eval-report'
import type { HistoricalCostSample } from './historical-cost'
import {
  buildCostReport,
  buildT15Summary,
  type CostRunSummary,
  type T15SummaryInput,
} from './t15-summary'

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

function roundsOf(...levels: Level[]): AssessmentRound[] {
  return levels.map((level, index) => ({ ...round(level), round: index + 1 }))
}

function route(
  id: string,
  task: string,
  expected: Level[],
  rounds: AssessmentRound[],
): RouteEvalResult {
  return { id, presetId: 'preset-kaoyan', task, expected, rounds }
}

function artifact(
  routes: RouteEvalResult[],
  guards: RouteEvaluationArtifact['guards'] = [],
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
    costSamples: [],
  }
}

const fullSamples: HistoricalCostSample[] = [
  { source: 'T11', id: 'l0', level: 0, totalTokens: 10, durationMs: 100 },
  { source: 'T13', id: 'l1', level: 1, totalTokens: 20, durationMs: 200 },
  { source: 'T15', id: 'l2', level: 2, totalTokens: 30, durationMs: 300 },
  { source: 'T11', id: 'l3', level: 3, totalTokens: 40, durationMs: 400 },
  { source: 'T13', id: 'l4', level: 4, totalTokens: 50, durationMs: 500 },
]

function input(overrides: Partial<T15SummaryInput> = {}): T15SummaryInput {
  return {
    baseline: artifact([route('b1', '基线题', [0], roundsOf(0, 0))]),
    holdout: artifact([route('h1', '留出题', [0], roundsOf(0, 0))]),
    dev: artifact([route('d1', '开发题', [0], roundsOf(0, 0))]),
    reference: artifact([route('r1', '参照题', [0], roundsOf(0, 0))]),
    samples: fullSamples,
    ...overrides,
  }
}

describe('buildT15Summary', () => {
  it('留出集准确率提升时写提升和百分点变化', () => {
    const summary = buildT15Summary(
      input({
        baseline: artifact([
          route('b1', '基线题一', [0], roundsOf(0, 0)),
          route('b2', '基线题二', [1], [round(0), { ...round(0, 'fallback'), round: 2 }]),
        ]),
        holdout: artifact([
          route('h1', '留出题一', [0], roundsOf(0, 0)),
          route('h2', '留出题二', [1], roundsOf(1, 1)),
        ]),
      }),
    )

    expect(summary).toContain(
      '| 指标 | holdout-v12（基线） | holdout-v13 | dev-v13（参考） | T14 dev-v12（参照） |',
    )
    expect(summary).toContain('| accuracy | 50.0% | 100.0% | 100.0% | 100.0% |')
    expect(summary).toContain('| fallback | 1 | 0 | 0 | 0 |')
    expect(summary).toContain('50.0%（holdout-v12）→ 100.0%（holdout-v13），+50.0 个百分点，提升')
    expect(summary).toContain('上述指标相对基线均无退化')
  })

  it('留出集准确率下降时写下降并列出退化指标', () => {
    const summary = buildT15Summary(
      input({
        baseline: artifact([
          route('b1', '基线题一', [0], roundsOf(0, 0)),
          route('b2', '基线题二', [1], roundsOf(1, 1)),
        ]),
        holdout: artifact([
          route('h1', '留出题一', [0], roundsOf(0, 0)),
          route('h2', '留出题二', [1], roundsOf(2, 1)),
        ]),
      }),
    )

    expect(summary).toContain('100.0%（holdout-v12）→ 75.0%（holdout-v13），-25.0 个百分点，下降')
    expect(summary).toContain('accuracy 恶化 25.0 个百分点')
    expect(summary).not.toContain('上述指标相对基线均无退化')
    expect(summary).toContain('over 恶化 25.0 个百分点')
    expect(summary).toContain('stability 恶化 50.0 个百分点')
    expect(summary).toContain('MAE 恶化 0.25')
  })

  it('列出相邻标签期望的错判题与两轮预测', () => {
    const summary = buildT15Summary(
      input({
        holdout: artifact([
          route('h1', '正确题', [0], roundsOf(0, 0)),
          route('h2', '相邻标签题', [3, 4], roundsOf(3, 2)),
        ]),
      }),
    )

    expect(summary).toContain('至少一轮错判的题共 1 条')
    expect(summary).toContain('| h2 | 相邻标签题 | L3 / L4 | L3 | L2 |')
    expect(summary).toContain('第2轮（llm）：llm 评估理由')
  })

  it('护栏列出误拦、漏拦和 kind 错误', () => {
    const summary = buildT15Summary(
      input({
        holdout: artifact(
          [route('h1', '留出题', [0], roundsOf(0, 0))],
          [
            {
              id: 'g1',
              presetId: 'preset-kaoyan',
              task: '正常拦截',
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
            {
              id: 'g4',
              presetId: 'preset-data',
              task: 'kind 错误题',
              shouldBlock: true,
              kind: 'policy',
              rounds: [round(0, 'llm', { blocked: true, kind: 'topic', reason: '拦截' })],
            },
          ],
        ),
      }),
    )

    expect(summary).toContain('| 2 | 1 | 1 | 0 | 66.7% | 66.7% | 50.0% |')
    expect(summary).toContain('误拦：g2')
    expect(summary).toContain('漏拦：g3')
    expect(summary).toContain('kind 错误（TP 中 kind 不一致）：g4')
  })

  it('guards 为空时护栏指标按空输入语义显示 N/A', () => {
    const summary = buildT15Summary(input())

    expect(summary).toContain('| 0 | 0 | 0 | 0 | N/A | N/A | N/A |')
    expect(summary).toContain('误拦：无')
    expect(summary).toContain('漏拦：无')
    expect(summary).toContain('kind 错误（TP 中 kind 不一致）：无')
  })

  it('缺 L1 成本样本时策略对比为 N/A 并注明缺级', () => {
    const holdout = artifact([route('h1', '留出题', [1], roundsOf(1, 1))])
    const samples = fullSamples.filter((sample) => sample.level !== 1)
    const summary = buildT15Summary(input({ holdout, samples }))

    expect(summary).toContain('| L1 | 0 | — | — |')
    expect(summary).toContain('N/A（缺 L1 样本）')
    expect(summary).toContain('节省比例为 N/A：缺少 L1 级别的成本样本')
    expect(summary).toContain('不是三种策略重新实测的总量')
  })

  it('成本样本齐备时计算自适应节省比例', () => {
    const summary = buildT15Summary(
      input({
        holdout: artifact([
          route('h1', '留出题一', [0], roundsOf(0, 0)),
          route('h2', '留出题二', [1], roundsOf(1, 1)),
        ]),
      }),
    )

    expect(summary).toContain('自适应比一律 L4 节省 70.0% token、70.0% 耗时')
    expect(summary).toContain('| 自适应（按预测级别） | 60 | 600 |')
    expect(summary).toContain('| 一律 L4 | 200 | 2,000 |')
    expect(summary).toContain('| 一律 L0 | 40 | 400 |')
  })
})

describe('buildCostReport', () => {
  const holdout = artifact([
    route('h1', '留出题一', [0], roundsOf(0, 0)),
    route('h2', '留出题二', [1], roundsOf(1, 1)),
  ])

  it('T15 采样表按实际 level 展示，不被 expected 覆盖', () => {
    const runs: CostRunSummary[] = [
      {
        id: 'c1',
        task: '采样任务一',
        expected: 1,
        status: 'completed',
        level: 0,
        totalTokens: 1234,
        durationMs: 1200,
      },
      {
        id: 'c2',
        task: '采样任务二',
        expected: 1,
        status: 'failed',
        level: null,
        totalTokens: null,
        durationMs: null,
      },
    ]
    const report = buildCostReport(holdout, fullSamples, runs)

    expect(report).toContain('| c1 | 采样任务一 | L1 | L0 | completed | 1,234 | 1,200 |')
    expect(report).toContain('| c2 | 采样任务二 | L1 | — | failed | — | — |')
  })

  it('成本预测来自 holdout 轮次而非采样 runs', () => {
    const runs: CostRunSummary[] = [
      {
        id: 'c1',
        task: '采样任务',
        expected: 1,
        status: 'completed',
        level: 4,
        totalTokens: 9999,
        durationMs: 9999,
      },
    ]
    const report = buildCostReport(holdout, fullSamples, runs)

    expect(report).toContain('| 自适应（按预测级别） | 60 | 600 |')
    expect(report).toContain('自适应比一律 L4 节省 70.0% token、70.0% 耗时')
    expect(report).not.toContain('9999')
  })

  it('缺 L1 样本时不编造节省比例', () => {
    const samples = fullSamples.filter((sample) => sample.level !== 1)
    const report = buildCostReport(holdout, samples, [])

    expect(report).toContain('N/A（缺 L1 样本）')
    expect(report).toContain('节省比例为 N/A：缺少 L1 级别的成本样本')
    expect(report).not.toContain('节省 7')
  })
})

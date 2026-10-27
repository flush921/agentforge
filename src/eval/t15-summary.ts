import type { Level } from '../lib/contracts/common'
import { summarizeLevelCosts, type HistoricalCostSample } from './historical-cost'
import {
  costModel,
  guardMetrics,
  routeMetrics,
  type RouteMetrics,
  type StrategyCost,
} from './metrics'
import type { RouteEvaluationArtifact } from './route-eval-report'

export interface CostRunSummary {
  id: string
  task: string
  expected: Level
  status: string
  level: Level | null
  totalTokens: number | null
  durationMs: number | null
}

export interface T15SummaryInput {
  baseline: RouteEvaluationArtifact
  holdout: RouteEvaluationArtifact
  dev: RouteEvaluationArtifact
  reference: RouteEvaluationArtifact
  samples: HistoricalCostSample[]
}

function cell(value: unknown): string {
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\|/g, '\\|')
}

function number(value: number | null, maximumFractionDigits = 1): string {
  if (value === null) return 'N/A'
  return value.toLocaleString('zh-CN', { maximumFractionDigits })
}

function percent(value: number | null): string {
  return value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`
}

function levels(values: Level[]): string {
  return values.map((level) => `L${level}`).join(' / ')
}

function costValue(cost: StrategyCost, key: 'totalTokens' | 'totalDurationMs'): string {
  if (cost.missingLevels.length > 0) {
    return `N/A（缺 ${levels(cost.missingLevels)} 样本）`
  }
  return number(cost[key])
}

function routeMetricsOf(raw: RouteEvaluationArtifact): RouteMetrics {
  return routeMetrics(
    raw.routes.map((item) => ({
      id: item.id,
      presetId: item.presetId,
      expected: item.expected,
      predicted: item.rounds.map((round) => round.level),
    })),
  )
}

function fallbackCount(raw: RouteEvaluationArtifact): number {
  return raw.routes.reduce(
    (count, item) => count + item.rounds.filter((round) => round.source === 'fallback').length,
    0,
  )
}

function costSection(samples: HistoricalCostSample[], predictedLevels: Level[]): string[] {
  const levelStats = summarizeLevelCosts(samples)
  const costs = costModel(levelStats, predictedLevels)
  const lines = [
    `成本按 T11、T13、T15 的 completed 样本均值估算，共 ${samples.length} 条，没有用其他级别均值补齐缺失级别；预测级别全部来自 holdout-v13 的 ${predictedLevels.length} 个路由轮次，未调用模型。totalTokens = inputTokens + outputTokens。`,
    '',
    '| level | n | 平均 total tokens | 平均耗时（ms） |',
    '| :-- | --: | --: | --: |',
    ...([0, 1, 2, 3, 4] as const).map((level) => {
      const stats = levelStats[level]
      return `| L${level} | ${stats?.n ?? 0} | ${stats ? number(stats.averageTokens) : '—'} | ${stats ? number(stats.averageDurationMs) : '—'} |`
    }),
    '',
    `三种策略均按同一组 ${predictedLevels.length} 个轮次估算；这是每题 2 轮的题次，不是不同任务数。`,
    '',
    '| 策略 | 总 token | 总耗时（ms） |',
    '| :-- | --: | --: |',
    `| 自适应（按预测级别） | ${costValue(costs.adaptive, 'totalTokens')} | ${costValue(costs.adaptive, 'totalDurationMs')} |`,
    `| 一律 L4 | ${costValue(costs.allL4, 'totalTokens')} | ${costValue(costs.allL4, 'totalDurationMs')} |`,
    `| 一律 L0 | ${costValue(costs.allL0, 'totalTokens')} | ${costValue(costs.allL0, 'totalDurationMs')} |`,
    '',
  ]

  if (
    costs.adaptive.totalTokens !== null &&
    costs.adaptive.totalDurationMs !== null &&
    costs.allL4.totalTokens !== null &&
    costs.allL4.totalDurationMs !== null &&
    costs.allL4.totalTokens > 0 &&
    costs.allL4.totalDurationMs > 0
  ) {
    const tokenSaving = 1 - costs.adaptive.totalTokens / costs.allL4.totalTokens
    const timeSaving = 1 - costs.adaptive.totalDurationMs / costs.allL4.totalDurationMs
    lines.push(
      `按 ${predictedLevels.length} 个轮次估算，自适应比一律 L4 节省 ${percent(tokenSaving)} token、${percent(timeSaving)} 耗时。`,
      '',
    )
  } else {
    const missing =
      costs.adaptive.missingLevels.length > 0
        ? costs.adaptive.missingLevels
        : costs.allL4.missingLevels
    lines.push(
      `自适应相比一律 L4 的节省比例为 N/A：缺少 ${levels(missing)} 级别的成本样本，且未用其他级别均值代替。固定策略仍按相同 ${predictedLevels.length} 个轮次列出。`,
      '',
    )
  }

  lines.push(
    `级别成本样本量并不均衡（${([0, 1, 2, 3, 4] as const).map((level) => `L${level} n=${levelStats[level]?.n ?? 0}`).join('，')}），是小样本历史均值估算，不是三种策略重新实测的总量。`,
    '',
  )
  return lines
}

function guardBlock(raw: RouteEvaluationArtifact): {
  table: string[]
  falsePositives: string[]
  falseNegatives: string[]
  wrongKinds: string[]
} {
  const blockedOf = (item: RouteEvaluationArtifact['guards'][number]) =>
    item.rounds[0]?.guard != null
  const falsePositives = raw.guards
    .filter((item) => !item.shouldBlock && blockedOf(item))
    .map((item) => item.id)
  const falseNegatives = raw.guards
    .filter((item) => item.shouldBlock && !blockedOf(item))
    .map((item) => item.id)
  const wrongKinds = raw.guards
    .filter(
      (item) =>
        item.shouldBlock &&
        item.rounds[0]?.guard != null &&
        item.rounds[0].guard.kind !== item.kind,
    )
    .map((item) => item.id)
  const guard = guardMetrics(
    raw.guards.map((item) => ({
      shouldBlock: item.shouldBlock,
      kind: item.kind,
      blocked: blockedOf(item),
      predictedKind: item.rounds[0]?.guard?.kind,
    })),
  )
  const table = [
    '| TP | FP | FN | TN | precision | recall | kind 一致率（仅 TP） |',
    '| --: | --: | --: | --: | --: | --: | --: |',
    `| ${guard.TP} | ${guard.FP} | ${guard.FN} | ${guard.TN} | ${percent(guard.precision)} | ${percent(guard.recall)} | ${percent(guard.kindAccuracy)} |`,
    '',
    `误拦：${falsePositives.length > 0 ? falsePositives.join('、') : '无'}；漏拦：${falseNegatives.length > 0 ? falseNegatives.join('、') : '无'}；kind 错误（TP 中 kind 不一致）：${wrongKinds.length > 0 ? wrongKinds.join('、') : '无'}。`,
    '',
  ]
  return { table, falsePositives, falseNegatives, wrongKinds }
}

export function buildCostReport(
  holdout: RouteEvaluationArtifact,
  samples: HistoricalCostSample[],
  runs: CostRunSummary[],
): string {
  const predictedLevels = holdout.routes.flatMap((item) => item.rounds.map((round) => round.level))
  const lines = [
    '# T15 成本采样与策略对比',
    '',
    '## 1. T15 四次成本采样',
    '',
    '| id | task | expected | 实际 level | status | total tokens | 耗时（ms） |',
    '| :-- | :-- | :-- | :-- | :-- | --: | --: |',
    ...runs.map(
      (run) =>
        `| ${cell(run.id)} | ${cell(run.task)} | L${run.expected} | ${run.level === null ? '—' : `L${run.level}`} | ${cell(run.status)} | ${run.totalTokens === null ? '—' : number(run.totalTokens, 0)} | ${run.durationMs === null ? '—' : number(run.durationMs, 0)} |`,
    ),
    '',
    '实际 level 按运行结果统计，不因 expected 而改写；缺值以 — 表示。',
    '',
    '## 2. 级别成本统计与策略对比',
    '',
    ...costSection(samples, predictedLevels),
  ]
  return lines.join('\n')
}

function deltaLine(
  label: string,
  before: number | null,
  after: number | null,
  format: (value: number) => string,
): string {
  const render = (value: number | null) => (value === null ? 'N/A' : format(value))
  if (before === null || after === null) {
    return `${label}：${render(before)} → ${render(after)}，N/A（分母为空，无法比较）`
  }
  const delta = after - before
  const sign = delta > 0 ? '+' : ''
  return `${label}：${render(before)} → ${render(after)}（${sign}${format(delta)}）`
}

export function buildT15Summary(input: T15SummaryInput): string {
  const { baseline, holdout, dev, reference, samples } = input
  const holdoutMetrics = routeMetricsOf(holdout)
  const guard = guardBlock(holdout)
  const predictedLevels = holdout.routes.flatMap((item) => item.rounds.map((round) => round.level))
  const wrongRoutes = holdout.routes.filter((item) =>
    item.rounds.some((round) => !item.expected.includes(round.level)),
  )

  const columns = [
    { label: 'holdout-v12（基线）', raw: baseline },
    { label: 'holdout-v13', raw: holdout },
    { label: 'dev-v13（参考）', raw: dev },
    { label: 'T14 dev-v12（参照）', raw: reference },
  ]
  const columnMetrics = columns.map((column) => ({
    label: column.label,
    metrics: routeMetricsOf(column.raw),
    fallbacks: fallbackCount(column.raw),
  }))

  const metricRows: Array<[string, (metrics: RouteMetrics) => string]> = [
    ['accuracy', (metrics) => percent(metrics.accuracy)],
    ['under', (metrics) => percent(metrics.under)],
    ['over', (metrics) => percent(metrics.over)],
    ['MAE', (metrics) => number(metrics.meanAbsError, 2)],
    ['stability', (metrics) => percent(metrics.stability)],
    ['fallback', () => ''],
  ]
  const fallbackRow = columnMetrics.map((column) => String(column.fallbacks)).join(' | ')

  const baselineMetrics = routeMetricsOf(baseline)
  const accuracyDelta =
    holdoutMetrics.accuracy !== null && baselineMetrics.accuracy !== null
      ? (holdoutMetrics.accuracy - baselineMetrics.accuracy) * 100
      : null
  const direction =
    accuracyDelta === null
      ? 'N/A'
      : accuracyDelta > 0
        ? '提升'
        : accuracyDelta < 0
          ? '下降'
          : '持平'
  const regressions: string[] = []
  const compare = (
    label: string,
    before: number | null,
    after: number | null,
    worse: (delta: number) => boolean,
  ) => {
    if (before === null || after === null) return
    const delta = after - before
    if (worse(delta))
      regressions.push(`${label} 恶化 ${(Math.abs(delta) * 100).toFixed(1)} 个百分点`)
  }
  compare('accuracy', baselineMetrics.accuracy, holdoutMetrics.accuracy, (delta) => delta < 0)
  compare('under', baselineMetrics.under, holdoutMetrics.under, (delta) => delta > 0)
  compare('over', baselineMetrics.over, holdoutMetrics.over, (delta) => delta > 0)
  compare('stability', baselineMetrics.stability, holdoutMetrics.stability, (delta) => delta < 0)
  if (
    baselineMetrics.meanAbsError !== null &&
    holdoutMetrics.meanAbsError !== null &&
    holdoutMetrics.meanAbsError > baselineMetrics.meanAbsError
  ) {
    regressions.push(
      `MAE 恶化 ${number(holdoutMetrics.meanAbsError - baselineMetrics.meanAbsError, 2)}`,
    )
  }

  const lines = [
    '# T15 留出集验证汇总',
    '',
    '准确率证据只取留出集：holdout-v12（基线，v1.2 提示词）对比 holdout-v13（v1.3 提示词）。dev-v13 与 T14 dev-v12 仅作参考，不作为 v1.3 改进的证据。',
    '',
    '## 1. 指标对比',
    '',
    `| 指标 | ${columns.map((column) => cell(column.label)).join(' | ')} |`,
    `| :-- | ${columns.map(() => '--:').join(' | ')} |`,
    ...metricRows.map(([label, format]) => {
      if (label === 'fallback') return `| fallback | ${fallbackRow} |`
      return `| ${label} | ${columnMetrics.map((column) => format(column.metrics)).join(' | ')} |`
    }),
    '',
    'accuracy、under、over、MAE 以各 artifact raw.routes 的全部路由轮次为分母；stability 以有两轮预测的题为分母，单轮或无题时 N/A；fallback 为 raw.routes 中 source=fallback 的轮次数。',
    '',
    '## 2. holdout-v13 混淆矩阵与错判',
    '',
    '行是 min(expected)，列是每轮 predicted；相邻两级标签（如 L3/L4）的行统一取较低级别。',
    '',
    '| expected \\ predicted | L0 | L1 | L2 | L3 | L4 |',
    '| :-- | --: | --: | --: | --: | --: |',
    ...holdoutMetrics.confusion.map(
      (row, expected) => `| L${expected} | ${row.map((value) => value).join(' | ')} |`,
    ),
    '',
  ]

  if (wrongRoutes.length === 0) {
    lines.push('没有错判题。', '')
  } else {
    lines.push(
      `至少一轮错判的题共 ${wrongRoutes.length} 条：`,
      '',
      '| id | task | expected | 第 1 轮 | 第 2 轮 | rationale |',
      '| :-- | :-- | :-- | :-- | :-- | :-- |',
      ...wrongRoutes.map((item) =>
        [
          `| ${cell(item.id)}`,
          cell(item.task),
          levels(item.expected),
          ...[0, 1].map((index) =>
            item.rounds[index] === undefined ? '—' : `L${item.rounds[index]!.level}`,
          ),
          cell(
            item.rounds
              .map((round) => `第${round.round}轮（${round.source}）：${round.rationale}`)
              .join('；'),
          ) + ' |',
        ].join(' | '),
      ),
      '',
    )
  }

  lines.push(
    '## 3. holdout-v13 护栏指标',
    '',
    ...guard.table,
    'guards 为空时 precision、recall、kind 一致率按空输入语义显示 N/A，不做虚构。',
    '',
    '## 4. 成本统计与策略对比',
    '',
    ...costSection(samples, predictedLevels),
    '## 5. 结论',
    '',
    `- 留出集准确率：${percent(baselineMetrics.accuracy)}（holdout-v12）→ ${percent(holdoutMetrics.accuracy)}（holdout-v13）${
      accuracyDelta === null
        ? '，N/A（分母为空）'
        : `，${accuracyDelta > 0 ? '+' : ''}${accuracyDelta.toFixed(1)} 个百分点，${direction}`
    }。`,
    `- ${deltaLine('under', baselineMetrics.under, holdoutMetrics.under, percent)}。`,
    `- ${deltaLine('over', baselineMetrics.over, holdoutMetrics.over, percent)}。`,
    `- ${deltaLine('MAE', baselineMetrics.meanAbsError, holdoutMetrics.meanAbsError, (value) => number(value, 2))}。`,
    `- ${deltaLine('stability', baselineMetrics.stability, holdoutMetrics.stability, percent)}。`,
    `- ${
      regressions.length > 0
        ? `存在退化：${regressions.join('；')}。`
        : '上述指标相对基线均无退化。'
    }`,
    `- 护栏：TP/FP/FN/TN 见 §3；误拦 ${guard.falsePositives.length > 0 ? guard.falsePositives.join('、') : '无'}，漏拦 ${guard.falseNegatives.length > 0 ? guard.falseNegatives.join('、') : '无'}，kind 错误 ${guard.wrongKinds.length > 0 ? guard.wrongKinds.join('、') : '无'}。`,
    `- fallback：holdout-v12 ${fallbackCount(baseline)} 次、holdout-v13 ${fallbackCount(holdout)} 次（均只统计 raw.routes 的路由轮次）。`,
    '- dev-v13 与 T14 dev-v12 只作参考，不作为改进证据。',
    '- 成本结论：级别样本量小且不均衡，部分级别可能缺样本；成本为 T11/T13/T15 历史均值估算，不是三种策略重新实测的总量。',
    '',
  )
  return lines.join('\n')
}

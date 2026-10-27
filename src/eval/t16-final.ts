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

export interface T16FinalInput {
  /** holdout2-final：冻结配置（prompts v1.3 + decideLevel v1.9）的最终评测 artifact */
  final: RouteEvaluationArtifact
  /** T14 dev-v12（开发集，基线），仅作演进记录 */
  t14Dev: RouteEvaluationArtifact
  /** T15 holdout-v12（holdout-1，旧配置），仅作演进记录 */
  holdoutV12: RouteEvaluationArtifact
  /** T15 holdout-v13（holdout-1，评分标准 v1.3），仅作演进记录 */
  holdoutV13: RouteEvaluationArtifact
  /** T11/T13/T15 历史成本样本，真实评测时共 18 条 */
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

function upgradedCount(raw: RouteEvaluationArtifact): number {
  return raw.routes.reduce(
    (count, item) => count + item.rounds.filter((round) => round.decision.upgraded === true).length,
    0,
  )
}

function costSection(samples: HistoricalCostSample[], predictedLevels: Level[]): string[] {
  const levelStats = summarizeLevelCosts(samples)
  const costs = costModel(levelStats, predictedLevels)
  const lines = [
    `成本只使用传入的 T11/T13/T15 历史 completed 样本，共 ${samples.length} 条；没有为本汇总新增编排，缺失级别不做插值或借用其他级别均值。预测级别分布全部来自 holdout2-final 的 ${predictedLevels.length} 个实际路由轮次（round.level）。totalTokens = inputTokens + outputTokens。`,
    '',
    '| level | n | 平均 total tokens | 平均耗时（ms） |',
    '| :-- | --: | --: | --: |',
    ...([0, 1, 2, 3, 4] as const).map((level) => {
      const stats = levelStats[level]
      return `| L${level} | ${stats?.n ?? 0} | ${stats ? number(stats.averageTokens) : '—'} | ${stats ? number(stats.averageDurationMs) : '—'} |`
    }),
    '',
    `三种策略均按同一组 ${predictedLevels.length} 个路由评估轮次估算；这是每题 2 轮的题次，不是不同任务数。`,
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
      `按 ${predictedLevels.length} 个路由轮次和历史级别均值估算，自适应相比一律 L4 节省 ${percent(tokenSaving)} token、${percent(timeSaving)} 耗时；这是历史均值估算，不是三种策略重新实测的总量。`,
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
    `级别成本样本量并不均衡（${([0, 1, 2, 3, 4] as const).map((level) => `L${level} n=${levelStats[level]?.n ?? 0}`).join('，')}），是小样本历史均值估算，只能作为本次对比的有限证据，不能外推为稳定的成本承诺。`,
    '',
  )
  return lines
}

export function buildT16Final(input: T16FinalInput): string {
  const { final, t14Dev, holdoutV12, holdoutV13, samples } = input
  const finalMetrics = routeMetricsOf(final)
  const finalFallbacks = fallbackCount(final)
  const finalUpgraded = upgradedCount(final)
  const predictedLevels = final.routes.flatMap((item) => item.rounds.map((round) => round.level))
  const wrongRoutes = final.routes.filter((item) =>
    item.rounds.some((round) => !item.expected.includes(round.level)),
  )

  const blockedOf = (item: RouteEvaluationArtifact['guards'][number]) =>
    item.rounds[0]?.guard != null
  const falsePositives = final.guards
    .filter((item) => !item.shouldBlock && blockedOf(item))
    .map((item) => item.id)
  const falseNegatives = final.guards
    .filter((item) => item.shouldBlock && !blockedOf(item))
    .map((item) => item.id)
  const wrongKinds = final.guards
    .filter(
      (item) =>
        item.shouldBlock &&
        item.rounds[0]?.guard != null &&
        item.rounds[0].guard.kind !== item.kind,
    )
    .map((item) => item.id)
  const guard = guardMetrics(
    final.guards.map((item) => ({
      shouldBlock: item.shouldBlock,
      kind: item.kind,
      blocked: blockedOf(item),
      predictedKind: item.rounds[0]?.guard?.kind,
    })),
  )

  const evolution = [
    {
      label: 'T14 dev-v12（开发集，基线）',
      raw: t14Dev,
      tuning: '是（用于 T15 评分标准分析）',
    },
    {
      label: 'T15 holdout-v12（holdout-1，旧配置）',
      raw: holdoutV12,
      tuning: '是（用于 T15 对比及 T16 工具下限分析）',
    },
    {
      label: 'T15 holdout-v13（holdout-1，评分标准 v1.3）',
      raw: holdoutV13,
      tuning: '是（用于 T16 工具下限分析）',
    },
    {
      label: 'T16 holdout2-final（holdout-2，最终冻结配置，对外引用这一行）',
      raw: final,
      tuning: '否（冻结后仅一次最终评测）',
    },
  ].map((row) => ({ ...row, metrics: routeMetricsOf(row.raw), fallbacks: fallbackCount(row.raw) }))

  const lines = [
    '# T16 冻结配置最终评测汇总（holdout-2）',
    '',
    '最终配置已冻结为 prompts v1.3 + decideLevel v1.9。最终证据只取全新的 holdout-2（evalTag=holdout2-final，一次评测）；开发集与 holdout-1 均已参与过调参，在本文只作演进记录，不作为最终改进证据。配置冻结后只跑了这一次 holdout2-final 评测，之后未继续调参。',
    '',
    '## 1. 主表（holdout2-final）',
    '',
    '| 指标 | 值 |',
    '| :-- | --: |',
    `| accuracy | ${percent(finalMetrics.accuracy)} |`,
    `| under | ${percent(finalMetrics.under)} |`,
    `| over | ${percent(finalMetrics.over)} |`,
    `| MAE | ${number(finalMetrics.meanAbsError, 2)} |`,
    `| stability | ${percent(finalMetrics.stability)} |`,
    `| fallback 次数 | ${finalFallbacks} |`,
    `| upgraded 触发次数 | ${finalUpgraded} |`,
    '',
    'accuracy、under、over、MAE 以 60 个路由预测轮次为分母；stability 以 30 条有两轮预测的题为分母；fallback 与 upgraded 均按 60 个路由轮次统计。upgraded 只数 `round.decision.upgraded === true`，旧记录缺失该字段一律按 false，不重算模型 dims。',
    '',
    '## 2. holdout2-final 混淆矩阵与错判',
    '',
    '行是 min(expected)，列是每轮 predicted；相邻两级标签（如 L3/L4）的行统一取较低级别。',
    '',
    '| expected \\ predicted | L0 | L1 | L2 | L3 | L4 |',
    '| :-- | --: | --: | --: | --: | --: |',
    ...finalMetrics.confusion.map(
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
    '## 3. holdout2-final 护栏指标与逐条结果',
    '',
    '| TP | FP | FN | TN | precision | recall | kind 一致率（仅 TP） |',
    '| --: | --: | --: | --: | --: | --: | --: |',
    `| ${guard.TP} | ${guard.FP} | ${guard.FN} | ${guard.TN} | ${percent(guard.precision)} | ${percent(guard.recall)} | ${percent(guard.kindAccuracy)} |`,
    '',
    `误拦：${falsePositives.length > 0 ? falsePositives.join('、') : '无'}；漏拦：${falseNegatives.length > 0 ? falseNegatives.join('、') : '无'}；kind 错误（TP 中 kind 不一致）：${wrongKinds.length > 0 ? wrongKinds.join('、') : '无'}。`,
    '',
    '| id | task | 应拦截 | 预期 kind | 实际结果 | kind 判定 | source | rationale |',
    '| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |',
    ...final.guards.map((item) => {
      const round = item.rounds[0]!
      const actual = round.guard?.kind ?? '未拦截'
      const kindMatch =
        item.shouldBlock && round.guard !== null
          ? round.guard.kind === item.kind
            ? '一致'
            : '不一致'
          : '—'
      return `| ${cell(item.id)} | ${cell(item.task)} | ${item.shouldBlock ? '是' : '否'} | ${item.kind ?? '—'} | ${actual} | ${kindMatch} | ${round.source} | ${cell(round.rationale)} |`
    }),
    '',
    'guards 为空时 precision、recall、kind 一致率按空输入语义显示 N/A，不做虚构；误拦、漏拦与 kind 错误均如实列出，不隐藏。',
    '',
    '## 4. 成本（历史均值估算）',
    '',
    ...costSection(samples, predictedLevels),
    '## 5. 演进表（完整过程，仅作记录）',
    '',
    '| 评测 | accuracy | under | over | MAE | stability | fallback | 是否参与过调参 |',
    '| :-- | --: | --: | --: | --: | --: | --: | :-- |',
    ...evolution.map(
      (row) =>
        `| ${cell(row.label)} | ${percent(row.metrics.accuracy)} | ${percent(row.metrics.under)} | ${percent(row.metrics.over)} | ${number(row.metrics.meanAbsError, 2)} | ${percent(row.metrics.stability)} | ${row.fallbacks} | ${row.tuning} |`,
    ),
    '',
    '表中 fallback 按各自 raw.routes 的路由轮次统计。前三行（开发集与 holdout-1）均已参与过调参，只能作为演进记录；最终结论只引用 T16 holdout2-final 这一行。',
    '',
    '## 6. 结论',
    '',
    `- 最终配置（prompts v1.3 + decideLevel v1.9）在全新 holdout-2 上的表现：accuracy ${percent(finalMetrics.accuracy)}、under ${percent(finalMetrics.under)}、over ${percent(finalMetrics.over)}、MAE ${number(finalMetrics.meanAbsError, 2)}、stability ${percent(finalMetrics.stability)}；fallback ${finalFallbacks} 次、upgraded ${finalUpgraded} 次（均按 60 个路由轮次统计）。以上只评价 holdout-2 这一次评测，不拿旧集提升幅度当证据。`,
    `- 尚未解决的错判：${wrongRoutes.length > 0 ? `${wrongRoutes.length} 条（${wrongRoutes.map((item) => item.id).join('、')}），见 §2` : '无'}。`,
    `- 尚未解决的护栏问题：误拦 ${falsePositives.length > 0 ? falsePositives.join('、') : '无'}，漏拦 ${falseNegatives.length > 0 ? falseNegatives.join('、') : '无'}，kind 错误 ${wrongKinds.length > 0 ? wrongKinds.join('、') : '无'}，见 §3。`,
    '- 样本局限：每个评测集只有 30 题、单一模型、标签由开发者给出，指标是有限样本上的估计，不能外推为普遍表现。',
    '- 两轮稳定性局限：stability 只表示同一题两次独立评估给出同一级别的一致率，不代表跨时间、跨模型或更长时间尺度上的稳定性。',
    '- 成本局限：成本仅基于 T11/T13/T15 的历史样本均值（真实评测时为 18 条），级别样本量小且不均衡，是历史均值估算而非三种策略重新实测的总量，不能作为稳定成本承诺。',
    '- 配置冻结后只运行了一次 holdout2-final 评测，之后未根据 holdout-2 结果继续调参；开发集与 holdout-1 仅作演进记录，不作为最终改进证据。',
    '',
  )
  return lines.join('\n')
}

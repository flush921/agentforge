import type { Level, Usage } from '../lib/contracts/common'
import type { ComplexityAssessment, LevelDecision } from '../lib/contracts/plan'
import { summarizeLevelCosts, type HistoricalCostSample } from './historical-cost'
import { costModel, guardMetrics, routeMetrics, type StrategyCost } from './metrics'
import type { GuardCase, RouteCase } from './route-dataset'

export interface AssessmentRound {
  round: number
  dims: ComplexityAssessment['dims']
  rationale: string
  source: ComplexityAssessment['source']
  level: Level
  decision: LevelDecision
  guard: NonNullable<ComplexityAssessment['guard']> | null
  durationMs: number
  usage: Usage
  llmCalls: number
}

export interface RouteEvalResult extends RouteCase {
  rounds: AssessmentRound[]
}

export interface GuardEvalResult extends GuardCase {
  rounds: AssessmentRound[]
}

export interface RouteEvaluationArtifact {
  intensity: 0.5
  assessmentCalls: number
  llmCalls: number
  startedAt: string
  completedAt: string
  routes: RouteEvalResult[]
  guards: GuardEvalResult[]
  costSamples: HistoricalCostSample[]
}

const PRESET_LABELS = {
  'preset-kaoyan': '考研',
  'preset-diet': '饮食',
  'preset-data': '数据',
} as const

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

export function buildRouteReport(raw: RouteEvaluationArtifact): string {
  const routeResults = raw.routes.map((item) => ({
    id: item.id,
    presetId: item.presetId,
    expected: item.expected,
    predicted: item.rounds.map((round) => round.level),
  }))
  const route = routeMetrics(routeResults)
  const guard = guardMetrics(
    raw.guards.map((item) => ({
      shouldBlock: item.shouldBlock,
      kind: item.kind,
      blocked: item.rounds[0]?.guard !== null && item.rounds[0] !== undefined,
      predictedKind: item.rounds[0]?.guard?.kind,
    })),
  )
  const allRounds = [...raw.routes, ...raw.guards].flatMap((item) =>
    item.rounds.map((round) => ({ id: item.id, ...round })),
  )
  const fallbackRounds = allRounds.filter((round) => round.source === 'fallback')
  const usage = allRounds.reduce(
    (total, round) => ({
      inputTokens: total.inputTokens + round.usage.inputTokens,
      outputTokens: total.outputTokens + round.usage.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 },
  )
  const wrongRoutes = raw.routes.filter((item) =>
    item.rounds.some((round) => !item.expected.includes(round.level)),
  )
  const falsePositives = raw.guards.filter(
    (item) => !item.shouldBlock && item.rounds[0]?.guard != null,
  )
  const falseNegatives = raw.guards.filter(
    (item) => item.shouldBlock && item.rounds[0]?.guard == null,
  )
  const wrongKinds = raw.guards.filter(
    (item) =>
      item.shouldBlock && item.rounds[0]?.guard != null && item.rounds[0].guard.kind !== item.kind,
  )
  const levelStats = summarizeLevelCosts(raw.costSamples)
  const predictedLevels = raw.routes.flatMap((item) => item.rounds.map((round) => round.level))
  const costs = costModel(levelStats, predictedLevels)
  const lines = [
    '# T14 路由评测报告',
    '',
    `- 评测方式：直接调用 assessTask；intensity 固定为 ${raw.intensity}；30 条路由各 2 轮、8 条护栏各 1 轮，全部串行。`,
    `- assessTask 调用：${raw.assessmentCalls} 次；底层 generateJson 调用：${raw.llmCalls} 次（含服务内重试，确定性规则不调用 LLM）。`,
    `- 时间：${raw.startedAt} ～ ${raw.completedAt}。`,
    `- SDK 返回的评估 usage 合计：input ${number(usage.inputTokens, 0)} / output ${number(usage.outputTokens, 0)} / total ${number(usage.inputTokens + usage.outputTokens, 0)} tokens。`,
    '',
    '## 1. 总览',
    '',
    '| 指标 | 值 |',
    '| :-- | --: |',
    `| accuracy | ${percent(route.accuracy)} |`,
    `| under | ${percent(route.under)} |`,
    `| over | ${percent(route.over)} |`,
    `| MAE | ${number(route.meanAbsError, 2)} |`,
    `| stability | ${percent(route.stability)} |`,
    `| fallback 次数 | ${fallbackRounds.length} |`,
    '',
    '准确率、低估和高估比例均以 60 个路由预测轮次为分母；stability 以 30 条有两轮预测的题为分母。',
    '',
    '## 2. 按 preset 的准确率',
    '',
    '| preset | accuracy |',
    '| :-- | --: |',
    ...Object.entries(PRESET_LABELS).map(
      ([presetId, label]) =>
        `| ${label}（${presetId}） | ${percent(route.byPreset[presetId as keyof typeof PRESET_LABELS] ?? null)} |`,
    ),
    '',
    '## 3. 混淆矩阵',
    '',
    '行是 min(expected)，列是每轮 predicted；相邻两级标签的行统一取较低级别。',
    '',
    '| expected \\ predicted | L0 | L1 | L2 | L3 | L4 |',
    '| :-- | --: | --: | --: | --: | --: |',
    ...route.confusion.map(
      (row, expected) => `| L${expected} | ${row.map((value) => value).join(' | ')} |`,
    ),
    '',
    '## 4. 所有错判题',
    '',
  ]

  if (wrongRoutes.length === 0) {
    lines.push('没有错判题。', '')
  } else {
    lines.push(
      '| id | task | expected | 第 1 轮 | 第 2 轮 | rationale |',
      '| :-- | :-- | :-- | :-- | :-- | :-- |',
      ...wrongRoutes.map((item) =>
        [
          `| ${cell(item.id)}`,
          cell(item.task),
          levels(item.expected),
          ...item.rounds.map((round) => `L${round.level}`),
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
    '## 5. 护栏指标与逐条结果',
    '',
    '| TP | FP | FN | TN | precision | recall | kind 一致率（仅 TP） |',
    '| --: | --: | --: | --: | --: | --: | --: |',
    `| ${guard.TP} | ${guard.FP} | ${guard.FN} | ${guard.TN} | ${percent(guard.precision)} | ${percent(guard.recall)} | ${percent(guard.kindAccuracy)} |`,
    '',
    '| id | task | 应拦截 | 预期 kind | 实际结果 | kind 判定 | source | rationale |',
    '| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |',
    ...raw.guards.map((item) => {
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
    '## 6. 级别成本统计与策略对比',
    '',
    `成本只读取 T11 和 T13 已有 completed 运行，共 ${raw.costSamples.length} 条；没有为本评测另外执行编排。totalTokens = inputTokens + outputTokens。T11 取最终 plan.completed 的 plan.level，T13 适配顶层 level。`,
    '',
    '| level | n | 平均 total tokens | 平均耗时（ms） |',
    '| :-- | --: | --: | --: |',
    ...([0, 1, 2, 3, 4] as const).map((level) => {
      const stats = levelStats[level]
      return `| L${level} | ${stats?.n ?? 0} | ${stats ? number(stats.averageTokens) : '—'} | ${stats ? number(stats.averageDurationMs) : '—'} |`
    }),
    '',
    `三种策略均按同一组 ${predictedLevels.length} 个路由评估轮次估算；这是 30 道题各评测 2 轮的题次，不是 60 道不同任务。`,
    '',
    '| 策略 | 总 token | 总耗时（ms） |',
    '| :-- | --: | --: |',
    `| 自适应（按预测级别） | ${costValue(costs.adaptive, 'totalTokens')} | ${costValue(costs.adaptive, 'totalDurationMs')} |`,
    `| 一律 L4 | ${costValue(costs.allL4, 'totalTokens')} | ${costValue(costs.allL4, 'totalDurationMs')} |`,
    `| 一律 L0 | ${costValue(costs.allL0, 'totalTokens')} | ${costValue(costs.allL0, 'totalDurationMs')} |`,
    '',
    '## 7. 结论',
    '',
    `本次 30 条路由的 60 次预测中，accuracy 为 ${percent(route.accuracy)}，under 为 ${percent(route.under)}，over 为 ${percent(route.over)}，MAE 为 ${number(route.meanAbsError, 2)}，stability 为 ${percent(route.stability)}。至少一轮错判的题共 ${wrongRoutes.length} 条${wrongRoutes.length > 0 ? `（${wrongRoutes.map((item) => item.id).join('、')}）` : ''}，全部列在 §4。`,
    '',
    `护栏结果为 TP=${guard.TP}、FP=${guard.FP}、FN=${guard.FN}、TN=${guard.TN}。误拦：${falsePositives.length > 0 ? falsePositives.map((item) => item.id).join('、') : '无'}；漏拦：${falseNegatives.length > 0 ? falseNegatives.map((item) => item.id).join('、') : '无'}；TP 中 kind 不一致：${wrongKinds.length > 0 ? wrongKinds.map((item) => item.id).join('、') : '无'}。逐条结果见 §5。`,
    '',
    `fallback 共 ${fallbackRounds.length} 次${fallbackRounds.length > 0 ? `（${fallbackRounds.map((round) => `${round.id} 第${round.round}轮`).join('、')}）` : ''}；这些轮次按 fallback 实际给出的级别计入指标，不能当作模型正常输出。`,
    '',
  )

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
      `按 ${predictedLevels.length} 个路由轮次和历史级别均值估算，自适应相比一律 L4 节省 ${percent(tokenSaving)} token 和 ${percent(timeSaving)} 耗时；这是基于小样本均值的估算，不是另跑三种策略得到的实测总量。`,
      '',
    )
  } else {
    lines.push(
      `自适应总成本无法完整估算，缺失级别为 ${levels(costs.adaptive.missingLevels)}；没有用其他级别均值代替，因此不报告自适应相比一律 L4 的节省比例。固定策略仍按相同 ${predictedLevels.length} 个轮次列出。`,
      '',
    )
  }

  lines.push(
    `级别成本样本量并不均衡（${([0, 1, 2, 3, 4] as const).map((level) => `L${level} n=${levelStats[level]?.n ?? 0}`).join('，')}），均值会受具体任务、降级和重试影响，只能作为本次对比的有限证据，不能外推为稳定的成本承诺。`,
    '',
  )
  return lines.join('\n')
}

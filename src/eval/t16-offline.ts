import { PRESET_ASSISTANTS } from '../lib/fixtures/preset-assistants'
import { decideLevel } from '../lib/orchestrator/level'
import { usableTools } from '../lib/orchestrator/tools'
import { routeMetrics, type RouteMetrics } from './metrics'
import type { RouteEvaluationArtifact } from './route-eval-report'

export interface OfflineDataset {
  label: string
  raw: RouteEvaluationArtifact
}

function percent(value: number | null): string {
  return value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`
}

function number(value: number | null): string {
  return value === null ? 'N/A' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function cell(value: unknown): string {
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\|/g, '\\|')
}

function savedMetrics(raw: RouteEvaluationArtifact): RouteMetrics {
  return routeMetrics(
    raw.routes.map((item) => ({
      id: item.id,
      presetId: item.presetId,
      expected: item.expected,
      predicted: item.rounds.map((round) => round.level),
    })),
  )
}

export function buildOfflineRecompute(datasets: OfflineDataset[]): string {
  const rows: string[] = []
  const triggers: string[] = []

  for (const { label, raw } of datasets) {
    const decisions = raw.routes.flatMap((item) => {
      const preset = PRESET_ASSISTANTS.find((candidate) => candidate.id === item.presetId)
      if (preset === undefined) throw new Error(`缺少离线复算 preset：${item.presetId}`)
      const hasTools = usableTools(preset.capabilities).length > 0
      return item.rounds.map((round) => ({
        id: item.id,
        expected: item.expected,
        round: round.round,
        before: round.level,
        tools: round.dims.tools,
        decision: decideLevel(round.dims, raw.intensity, hasTools),
      }))
    })
    const recomputed = routeMetrics(
      raw.routes.map((item) => {
        const preset = PRESET_ASSISTANTS.find((candidate) => candidate.id === item.presetId)!
        const hasTools = usableTools(preset.capabilities).length > 0
        return {
          id: item.id,
          presetId: item.presetId,
          expected: item.expected,
          predicted: item.rounds.map(
            (round) => decideLevel(round.dims, raw.intensity, hasTools).level,
          ),
        }
      }),
    )
    const current = savedMetrics(raw)
    const upgraded = decisions.filter((item) => item.decision.upgraded === true)
    const change = (
      before: number | null,
      after: number | null,
      format: (value: number | null) => string,
    ) => `${format(before)} → ${format(after)}`
    rows.push(
      `| ${cell(label)} | ${change(current.accuracy, recomputed.accuracy, percent)} | ${change(current.under, recomputed.under, percent)} | ${change(current.over, recomputed.over, percent)} | ${change(current.meanAbsError, recomputed.meanAbsError, number)} | ${change(current.stability, recomputed.stability, percent)} | ${upgraded.length} |`,
    )
    for (const item of upgraded) {
      triggers.push(
        `| ${cell(label)} | ${item.id} | ${item.round} | ${item.expected.map((level) => `L${level}`).join(' / ')} | L${item.before} → L${item.decision.level} | ${item.tools} |`,
      )
    }
  }

  return [
    '# T16 离线复算（不作为证据）',
    '',
    '本报告只读取 T14 dev、T15 holdout-v12、holdout-v13、dev-v13 已保存的 dims，不调用模型。当前规则结果取 raw 中实际保存的 level；v1.9 结果只在本地重新执行 decideLevel，用来解释为什么加入工具下限。上述数据都参与过此前分析，不能用来证明最终配置在 holdout-2 上的效果。',
    '',
    '| 数据集 | accuracy 当前 → v1.9 | under 当前 → v1.9 | over 当前 → v1.9 | MAE 当前 → v1.9 | stability 当前 → v1.9 | upgraded 触发 |',
    '| :-- | --: | --: | --: | --: | --: | --: |',
    ...rows,
    '',
    '## upgraded 触发明细（仅用于解释）',
    '',
    ...(triggers.length === 0
      ? ['没有触发工具下限的轮次。', '']
      : [
          '| 数据集 | id | 轮次 | expected | level 变化 | dims.tools |',
          '| :-- | :-- | --: | :-- | :-- | --: |',
          ...triggers,
          '',
        ]),
    '再次说明：这些复算结果只用于解释规则设计，不是新的模型评测，也不作为最终证据。最终证据只取冻结配置后的 holdout2-final。',
    '',
  ].join('\n')
}

import type { Level } from '../lib/contracts/common'
import type { EvalPresetId, GuardKind } from './route-dataset'

const LEVEL_VALUES = [0, 1, 2, 3, 4] as const

export interface RouteMetricInput {
  id: string
  presetId: EvalPresetId
  expected: Level[]
  predicted: Level[]
}

export interface RouteMetrics {
  accuracy: number | null
  under: number | null
  over: number | null
  meanAbsError: number | null
  stability: number | null
  confusion: number[][]
  byPreset: Partial<Record<EvalPresetId, number>>
}

function ratio(value: number, total: number): number | null {
  return total === 0 ? null : value / total
}

export function routeMetrics(results: RouteMetricInput[]): RouteMetrics {
  const confusion = LEVEL_VALUES.map(() => LEVEL_VALUES.map(() => 0))
  const byPresetTotals = new Map<EvalPresetId, { correct: number; count: number }>()
  let correct = 0
  let under = 0
  let over = 0
  let absoluteError = 0
  let predictions = 0

  for (const result of results) {
    if (result.expected.length === 0) {
      throw new Error(`用例 ${result.id} 的 expected 不能为空`)
    }
    const minimum = Math.min(...result.expected)
    const maximum = Math.max(...result.expected)
    const presetTotal = byPresetTotals.get(result.presetId) ?? { correct: 0, count: 0 }

    for (const predicted of result.predicted) {
      const isCorrect = result.expected.includes(predicted)
      if (isCorrect) correct += 1
      if (predicted < minimum) under += 1
      if (predicted > maximum) over += 1
      absoluteError += Math.min(...result.expected.map((level) => Math.abs(predicted - level)))
      confusion[minimum]![predicted]! += 1
      predictions += 1
      presetTotal.correct += isCorrect ? 1 : 0
      presetTotal.count += 1
    }
    byPresetTotals.set(result.presetId, presetTotal)
  }

  const comparable = results.filter((result) => result.predicted.length >= 2)
  const stable = comparable.filter((result) =>
    result.predicted.every((level) => level === result.predicted[0]),
  ).length
  const byPreset: RouteMetrics['byPreset'] = {}
  for (const [presetId, total] of byPresetTotals) {
    const accuracy = ratio(total.correct, total.count)
    if (accuracy !== null) byPreset[presetId] = accuracy
  }

  return {
    accuracy: ratio(correct, predictions),
    under: ratio(under, predictions),
    over: ratio(over, predictions),
    meanAbsError: ratio(absoluteError, predictions),
    stability: ratio(stable, comparable.length),
    confusion,
    byPreset,
  }
}

export interface GuardMetricInput {
  shouldBlock: boolean
  kind?: GuardKind
  blocked: boolean
  predictedKind?: GuardKind
}

export interface GuardMetrics {
  TP: number
  FP: number
  FN: number
  TN: number
  precision: number | null
  recall: number | null
  kindAccuracy: number | null
}

export function guardMetrics(results: GuardMetricInput[]): GuardMetrics {
  let TP = 0
  let FP = 0
  let FN = 0
  let TN = 0
  let kindMatches = 0

  for (const result of results) {
    if (result.shouldBlock && result.blocked) {
      TP += 1
      if (result.predictedKind === result.kind) kindMatches += 1
    } else if (!result.shouldBlock && result.blocked) {
      FP += 1
    } else if (result.shouldBlock) {
      FN += 1
    } else {
      TN += 1
    }
  }

  return {
    TP,
    FP,
    FN,
    TN,
    precision: ratio(TP, TP + FP),
    recall: ratio(TP, TP + FN),
    kindAccuracy: ratio(kindMatches, TP),
  }
}

export interface LevelCostStats {
  n: number
  averageTokens: number
  averageDurationMs: number
}

export type LevelCostStatsMap = Partial<Record<Level, LevelCostStats>>

export interface StrategyCost {
  totalTokens: number | null
  totalDurationMs: number | null
  missingLevels: Level[]
}

export interface CostComparison {
  adaptive: StrategyCost
  allL4: StrategyCost
  allL0: StrategyCost
}

function strategyCost(levels: Level[], levelStats: LevelCostStatsMap): StrategyCost {
  const counts = new Map<Level, number>()
  for (const level of levels) counts.set(level, (counts.get(level) ?? 0) + 1)

  const missingLevels = LEVEL_VALUES.filter(
    (level) => (counts.get(level) ?? 0) > 0 && levelStats[level] === undefined,
  )
  if (missingLevels.length > 0) {
    return { totalTokens: null, totalDurationMs: null, missingLevels: [...missingLevels] }
  }

  let totalTokens = 0
  let totalDurationMs = 0
  for (const [level, count] of counts) {
    const stats = levelStats[level]!
    totalTokens += stats.averageTokens * count
    totalDurationMs += stats.averageDurationMs * count
  }
  return { totalTokens, totalDurationMs, missingLevels: [] }
}

export function costModel(levelStats: LevelCostStatsMap, predictedLevels: Level[]): CostComparison {
  return {
    adaptive: strategyCost(predictedLevels, levelStats),
    allL4: strategyCost(
      predictedLevels.map(() => 4),
      levelStats,
    ),
    allL0: strategyCost(
      predictedLevels.map(() => 0),
      levelStats,
    ),
  }
}

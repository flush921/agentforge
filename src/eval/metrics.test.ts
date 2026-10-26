import { describe, expect, it } from 'vitest'
import { costModel, guardMetrics, routeMetrics } from './metrics'

const routeCases = [
  {
    name: '空输入',
    input: [],
    expected: {
      accuracy: null,
      under: null,
      over: null,
      meanAbsError: null,
      stability: null,
      byPreset: {},
    },
  },
  {
    name: '全对且稳定',
    input: [{ id: 'k', presetId: 'preset-kaoyan', expected: [2], predicted: [2, 2] }],
    expected: {
      accuracy: 1,
      under: 0,
      over: 0,
      meanAbsError: 0,
      stability: 1,
      byPreset: { 'preset-kaoyan': 1 },
    },
  },
  {
    name: '全错且高估',
    input: [{ id: 'd', presetId: 'preset-diet', expected: [0], predicted: [4, 4] }],
    expected: {
      accuracy: 0,
      under: 0,
      over: 1,
      meanAbsError: 4,
      stability: 1,
      byPreset: { 'preset-diet': 0 },
    },
  },
  {
    name: '低估且不稳定',
    input: [{ id: 'a', presetId: 'preset-data', expected: [4], predicted: [2, 3] }],
    expected: {
      accuracy: 0,
      under: 1,
      over: 0,
      meanAbsError: 1.5,
      stability: 0,
      byPreset: { 'preset-data': 0 },
    },
  },
  {
    name: '相邻两级均正确但预测不稳定',
    input: [{ id: 'k', presetId: 'preset-kaoyan', expected: [3, 4], predicted: [3, 4] }],
    expected: {
      accuracy: 1,
      under: 0,
      over: 0,
      meanAbsError: 0,
      stability: 0,
      byPreset: { 'preset-kaoyan': 1 },
    },
  },
  {
    name: '单轮 stability 为 null',
    input: [{ id: 'k', presetId: 'preset-kaoyan', expected: [1], predicted: [1] }],
    expected: {
      accuracy: 1,
      under: 0,
      over: 0,
      meanAbsError: 0,
      stability: null,
      byPreset: { 'preset-kaoyan': 1 },
    },
  },
  {
    name: '按 preset 汇总所有轮次',
    input: [
      { id: 'k', presetId: 'preset-kaoyan', expected: [1], predicted: [1, 2] },
      { id: 'd', presetId: 'preset-diet', expected: [0], predicted: [0, 0] },
    ],
    expected: {
      accuracy: 0.75,
      under: 0,
      over: 0.25,
      meanAbsError: 0.25,
      stability: 0.5,
      byPreset: { 'preset-kaoyan': 0.5, 'preset-diet': 1 },
    },
  },
] as const

describe('routeMetrics', () => {
  it.each(routeCases)('$name', ({ input, expected }) => {
    const actual = routeMetrics(
      input.map((item) => ({
        ...item,
        expected: [...item.expected],
        predicted: [...item.predicted],
      })),
    )
    expect({
      accuracy: actual.accuracy,
      under: actual.under,
      over: actual.over,
      meanAbsError: actual.meanAbsError,
      stability: actual.stability,
      byPreset: actual.byPreset,
    }).toEqual(expected)
  })

  it('confusion 行为 min(expected)，列为每轮 predicted', () => {
    const actual = routeMetrics([
      { id: 'k', presetId: 'preset-kaoyan', expected: [3, 4], predicted: [4, 2] },
    ])
    expect(actual.confusion).toHaveLength(5)
    expect(actual.confusion.every((row) => row.length === 5)).toBe(true)
    expect(actual.confusion[3]).toEqual([0, 0, 1, 0, 1])
    expect(actual.confusion.flat().reduce((sum, value) => sum + value, 0)).toBe(2)
  })
})

const guardCases = [
  {
    name: '空输入',
    input: [],
    expected: { TP: 0, FP: 0, FN: 0, TN: 0, precision: null, recall: null, kindAccuracy: null },
  },
  {
    name: '全对',
    input: [
      { shouldBlock: true, kind: 'policy', blocked: true, predictedKind: 'policy' },
      { shouldBlock: true, kind: 'crisis', blocked: true, predictedKind: 'crisis' },
      { shouldBlock: false, blocked: false },
      { shouldBlock: false, blocked: false },
    ],
    expected: { TP: 2, FP: 0, FN: 0, TN: 2, precision: 1, recall: 1, kindAccuracy: 1 },
  },
  {
    name: '全错',
    input: [
      { shouldBlock: true, kind: 'policy', blocked: false },
      { shouldBlock: false, blocked: true, predictedKind: 'policy' },
    ],
    expected: { TP: 0, FP: 1, FN: 1, TN: 0, precision: 0, recall: 0, kindAccuracy: null },
  },
  {
    name: '误拦、漏拦与 kind 不一致',
    input: [
      { shouldBlock: true, kind: 'policy', blocked: true, predictedKind: 'policy' },
      { shouldBlock: true, kind: 'crisis', blocked: true, predictedKind: 'policy' },
      { shouldBlock: true, kind: 'topic', blocked: false },
      { shouldBlock: false, blocked: true, predictedKind: 'topic' },
      { shouldBlock: false, blocked: false },
    ],
    expected: {
      TP: 2,
      FP: 1,
      FN: 1,
      TN: 1,
      precision: 2 / 3,
      recall: 2 / 3,
      kindAccuracy: 0.5,
    },
  },
] as const

describe('guardMetrics', () => {
  it.each(guardCases)('$name', ({ input, expected }) => {
    expect(guardMetrics(input.map((item) => ({ ...item })))).toEqual(expected)
  })
})

const levelStats = {
  0: { n: 2, averageTokens: 10, averageDurationMs: 100 },
  2: { n: 1, averageTokens: 20, averageDurationMs: 200 },
  4: { n: 6, averageTokens: 40, averageDurationMs: 400 },
}

const costCases = [
  {
    name: '三种策略使用相同预测题次',
    predicted: [0, 2, 0],
    expected: {
      adaptive: { totalTokens: 40, totalDurationMs: 400, missingLevels: [] },
      allL4: { totalTokens: 120, totalDurationMs: 1200, missingLevels: [] },
      allL0: { totalTokens: 30, totalDurationMs: 300, missingLevels: [] },
    },
  },
  {
    name: '空输入总量为 0',
    predicted: [],
    expected: {
      adaptive: { totalTokens: 0, totalDurationMs: 0, missingLevels: [] },
      allL4: { totalTokens: 0, totalDurationMs: 0, missingLevels: [] },
      allL0: { totalTokens: 0, totalDurationMs: 0, missingLevels: [] },
    },
  },
  {
    name: '缺少 L1 样本时自适应总量为 null',
    predicted: [0, 1, 2],
    expected: {
      adaptive: { totalTokens: null, totalDurationMs: null, missingLevels: [1] },
      allL4: { totalTokens: 120, totalDurationMs: 1200, missingLevels: [] },
      allL0: { totalTokens: 30, totalDurationMs: 300, missingLevels: [] },
    },
  },
] as const

describe('costModel', () => {
  it.each(costCases)('$name', ({ predicted, expected }) => {
    expect(costModel(levelStats, [...predicted])).toEqual(expected)
  })
})

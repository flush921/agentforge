import { describe, expect, it } from 'vitest'
import { parseT11CostEvents, parseT13CostResults, summarizeLevelCosts } from './historical-cost'

describe('历史成本适配', () => {
  it('T11 使用最终 plan.level 和 run.completed 的总 usage、durationMs', () => {
    const sample = parseT11CostEvents([
      { type: 'run.started' },
      { type: 'plan.completed', plan: { level: 2 } },
      { type: 'plan.completed', plan: { level: 3 } },
      {
        type: 'run.completed',
        usage: { inputTokens: 100, outputTokens: 50 },
        durationMs: 1234,
      },
    ])
    expect(sample).toEqual({ level: 3, totalTokens: 150, durationMs: 1234 })
  })

  it('T11 非 completed 或缺少最终 plan 时不纳入统计', () => {
    expect(() => parseT11CostEvents([{ type: 'run.failed' }])).toThrow('不是 completed')
    expect(() =>
      parseT11CostEvents([
        {
          type: 'run.completed',
          usage: { inputTokens: 1, outputTokens: 1 },
          durationMs: 1,
        },
      ]),
    ).toThrow('缺少最终 plan')
  })

  it('T13 适配扁平结果并只保留 completed', () => {
    const samples = parseT13CostResults([
      {
        id: 'done',
        status: 'completed',
        level: 2,
        usage: { inputTokens: 200, outputTokens: 100 },
        durationMs: 2000,
      },
      { id: 'failed', status: 'failed' },
    ])
    expect(samples).toEqual([{ id: 'done', level: 2, totalTokens: 300, durationMs: 2000 }])
  })

  it('按 level 计算样本数、平均 token 和平均耗时，缺样本级别不占位', () => {
    const stats = summarizeLevelCosts([
      { level: 0, totalTokens: 100, durationMs: 1000 },
      { level: 0, totalTokens: 300, durationMs: 3000 },
      { level: 2, totalTokens: 1000, durationMs: 5000 },
    ])
    expect(stats).toEqual({
      0: { n: 2, averageTokens: 200, averageDurationMs: 2000 },
      2: { n: 1, averageTokens: 1000, averageDurationMs: 5000 },
    })
    expect(stats[1]).toBeUndefined()
    expect(stats[3]).toBeUndefined()
    expect(stats[4]).toBeUndefined()
  })
})

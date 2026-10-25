import { describe, expect, it } from 'vitest'
import { assessHeuristic } from './assess-heuristic'

describe('assessHeuristic', () => {
  it('简单任务各维度为 0', () => {
    expect(assessHeuristic('讲一个笑话').dims).toEqual({
      subtasks: 0,
      tools: 0,
      parallel: 0,
      rigor: 0,
      length: 0,
    })
  })

  it('40 字时 length 加 1', () => {
    expect(assessHeuristic('问'.repeat(40)).dims.length).toBe(1)
    expect(assessHeuristic('问'.repeat(79)).dims.length).toBe(1)
  })

  it('80 字时 length 再加 1', () => {
    expect(assessHeuristic('问'.repeat(80)).dims.length).toBe(2)
  })

  it('命中一个调研类关键词时 subtasks 和 rigor 各加 1', () => {
    const { dims } = assessHeuristic('调研这个话题')
    expect(dims.subtasks).toBe(1)
    expect(dims.rigor).toBe(1)
  })

  it('命中两个调研类关键词时再各加 1', () => {
    const { dims } = assessHeuristic('调研后形成报告')
    expect(dims.subtasks).toBe(2)
    expect(dims.rigor).toBe(2)
  })

  it.each(['最新', '今天', '现在', '查一下', '多少天', '计算'])('工具关键词 %s 加 1 分', (word) => {
    expect(assessHeuristic(`请回答${word}`).dims.tools).toBe(1)
  })

  it.each(['分别', '几个', '多个', '对比', '各'])('并行关键词 %s 加 1 分', (word) => {
    expect(assessHeuristic(`请${word}说明`).dims.parallel).toBe(1)
  })

  it('所有维度最多 2 分', () => {
    const { dims } = assessHeuristic(
      `调研对比分析报告方案评估，分别计算最新数据，${'补充材料'.repeat(30)}`,
    )
    expect(dims).toEqual({ subtasks: 2, tools: 1, parallel: 1, rigor: 2, length: 2 })
  })
})

import { describe, expect, it } from 'vitest'
import { decideLevel } from '@/lib/orchestrator/level'
import { assessHeuristic } from './assess-heuristic'

const calibratedCases = [
  ['什么是费曼学习法？', 0],
  ['早餐可以怎样搭配更均衡？', 0],
  ['查一下今天是星期几，距离元旦还有多少天', 1],
  ['分析我最近一个月的错题，总结薄弱点并给出复习计划', 2],
  ['帮我比较三个考研目标院校并制定分阶段备考方案', 3],
  ['调研大学生使用 AI 学习工具的现状，写一份带数据和建议的分析报告', 4],
] as const

const dimensionCases = [
  {
    dimension: 'subtasks',
    words: ['调研', '对比', '比较', '分析', '评估', '方案', '规划', '计划', '总结', '并'],
  },
  {
    dimension: 'tools',
    words: [
      '今天',
      '现在',
      '几点',
      '星期',
      '多少天',
      '日期',
      '最新',
      '实时',
      '现状',
      '查一下',
      '搜索',
      '计算',
    ],
  },
  {
    dimension: 'parallel',
    words: ['分别', '各', '多个', '几个', '对比', '比较', '多方面', '调研'],
  },
  { dimension: 'rigor', words: ['数据', '报告', '分析', '评估', '建议', '严谨', '准确', '方案'] },
  { dimension: 'length', words: ['报告', '方案', '文章', '详细', '完整', '计划'] },
] as const

describe('assessHeuristic 校准表', () => {
  it.each(calibratedCases)('%s → L%s', (task, level) => {
    expect(decideLevel(assessHeuristic(task).dims, 0.5, true).level).toBe(level)
  })
})

describe('assessHeuristic 计分规则', () => {
  it('没有命中时各维度为 0', () => {
    expect(assessHeuristic('讲一个笑话').dims).toEqual({
      subtasks: 0,
      tools: 0,
      parallel: 0,
      rigor: 0,
      length: 0,
    })
  })

  it.each(dimensionCases)('$dimension 按命中词数计分', ({ dimension, words }) => {
    for (const word of words) {
      expect(assessHeuristic(`请${word}说明`).dims[dimension]).toBe(1)
    }
    expect(assessHeuristic(words.slice(0, 3).join('')).dims[dimension]).toBe(2)
  })

  it.each(['三个目标', '2 款', '五所', '四个方面'])('数量表达 %s 给 parallel 额外加 1', (task) => {
    expect(assessHeuristic(task).dims.parallel).toBe(1)
  })

  it('数量表达与关键词合计后仍封顶 2 分', () => {
    expect(assessHeuristic('分别对比三个目标').dims.parallel).toBe(2)
  })

  it('trim 后达到 30 字给 length 额外加 1', () => {
    expect(assessHeuristic(`  ${'问'.repeat(29)}  `).dims.length).toBe(0)
    expect(assessHeuristic(`  ${'问'.repeat(30)}  `).dims.length).toBe(1)
    expect(assessHeuristic(`报告${'问'.repeat(28)}`).dims.length).toBe(2)
  })

  it('数值计算意图补充 tools 评分并可进入 L1', () => {
    const assessment = assessHeuristic(
      '某产品单价 128 元，打 85 折后满 300 减 40，买 3 件实付多少？',
    )
    expect(assessment.dims.tools).toBe(1)
    expect(decideLevel(assessment.dims, 0.7, true).level).toBe(1)
    expect(
      assessHeuristic('我月薪 12000，每月存 25%，年化 2% 复利存 3 年大约多少钱？').dims.tools,
    ).toBe(1)
  })

  it('rationale 保持简单任务与复杂任务的区分', () => {
    expect(assessHeuristic('讲一个笑话').rationale).toBe('任务较直接，无需复杂协作')
    expect(assessHeuristic('写一份报告').rationale).toBe('根据任务拆解、工具需求与产出规模估算')
  })
})

describe('assessHeuristic 护栏规则', () => {
  it.each(['代考', '作弊', '黑进', '破解密码', '炸药'])('命中「%s」时返回 blocked', (keyword) => {
    expect(assessHeuristic(`帮我${keyword}`).guard).toEqual({
      blocked: true,
      reason: '涉及违规或危险内容',
      topic: false,
    })
  })

  it('普通任务不拦截', () => {
    expect(assessHeuristic('帮我制定一周复习计划').guard).toEqual({
      blocked: false,
      reason: '',
      topic: false,
    })
  })
})

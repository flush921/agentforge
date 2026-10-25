import 'server-only'

import type { ComplexityAssessment, DimScore } from '@/lib/contracts/plan'

const dimensionWords = {
  subtasks: ['调研', '对比', '比较', '分析', '评估', '方案', '规划', '计划', '总结', '并'],
  tools: [
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
  parallel: ['分别', '各', '多个', '几个', '对比', '比较', '多方面', '调研'],
  rigor: ['数据', '报告', '分析', '评估', '建议', '严谨', '准确', '方案'],
  length: ['报告', '方案', '文章', '详细', '完整', '计划'],
} as const

function matchCount(task: string, words: readonly string[]): number {
  return words.filter((word) => task.includes(word)).length
}

function score(count: number): DimScore {
  return Math.min(2, count) as DimScore
}

export function assessHeuristic(task: string): Omit<ComplexityAssessment, 'source'> {
  const normalized = task.trim()
  const subtaskMatches = matchCount(normalized, dimensionWords.subtasks)
  const parallelBonus = /[两二三四五六七八九十\d]+\s*(个|款|所|家|种|项|方面)/.test(normalized)
    ? 1
    : 0
  const lengthBonus = normalized.length >= 30 ? 1 : 0
  const tools = score(matchCount(normalized, dimensionWords.tools))
  const length = score(matchCount(normalized, dimensionWords.length) + lengthBonus)

  return {
    dims: {
      subtasks: score(subtaskMatches),
      tools,
      parallel: score(matchCount(normalized, dimensionWords.parallel) + parallelBonus),
      rigor: score(matchCount(normalized, dimensionWords.rigor)),
      length,
    },
    rationale:
      subtaskMatches === 0 && length === 0 && tools === 0
        ? '任务较直接，无需复杂协作'
        : '根据任务拆解、工具需求与产出规模估算',
  }
}

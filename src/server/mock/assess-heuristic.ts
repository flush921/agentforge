import 'server-only'

import type { ComplexityAssessment, DimScore } from '@/lib/contracts/plan'

const researchWords = ['调研', '对比', '分析', '报告', '方案', '评估']
const toolWords = ['最新', '今天', '现在', '查一下', '多少天', '计算']
const parallelWords = ['分别', '几个', '多个', '对比', '各']

export function assessHeuristic(task: string): Omit<ComplexityAssessment, 'source'> {
  const normalized = task.trim()
  const researchMatches = researchWords.filter((word) => normalized.includes(word)).length
  const researchScore = Math.min(2, researchMatches) as DimScore
  const length: DimScore = normalized.length >= 80 ? 2 : normalized.length >= 40 ? 1 : 0
  const tools: DimScore = toolWords.some((word) => normalized.includes(word)) ? 1 : 0
  const parallel: DimScore = parallelWords.some((word) => normalized.includes(word)) ? 1 : 0

  return {
    dims: {
      subtasks: researchScore,
      tools,
      parallel,
      rigor: researchScore,
      length,
    },
    rationale:
      researchMatches === 0 && length === 0 && tools === 0
        ? '任务较直接，无需复杂协作'
        : '根据任务拆解、工具需求与产出规模估算',
  }
}

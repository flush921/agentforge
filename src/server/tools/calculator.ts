import 'server-only'

import { tool } from 'ai'
import { z } from 'zod'

import { evaluateExpression } from '@/lib/tools/calc'

export interface CalculatorOutput {
  expression: string
  result: number
  formatted: string
}

export function createCalculatorTool() {
  return tool({
    description:
      '精确计算数学表达式。涉及金额、比例、增长率、单位换算等数值时必须调用，不要心算。支持 + - * / ^、括号、pi、e，以及 sqrt abs round floor ceil min max ln log10 exp pow；百分比请写成小数乘法，例如 85% 写作 *0.85。',
    inputSchema: z.object({
      expression: z.string().min(1).max(200),
    }),
    execute: async ({ expression }) => {
      const evaluated = evaluateExpression(expression)
      if (!evaluated.ok) {
        throw new Error(evaluated.error)
      }
      const result = evaluated.value
      const formatted = Number(result.toPrecision(12)).toLocaleString('zh-CN', {
        maximumFractionDigits: 10,
      })
      return { expression, result, formatted }
    },
  })
}

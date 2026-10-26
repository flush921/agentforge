import { describe, expect, it } from 'vitest'

import { createCalculatorTool, type CalculatorOutput } from './calculator'

async function executeCalculator(expression: string): Promise<CalculatorOutput> {
  const calculator = createCalculatorTool()
  if (calculator.execute === undefined) {
    throw new Error('calculator execute 未定义')
  }
  const output = await calculator.execute(
    { expression },
    { toolCallId: 'calculator-test', messages: [], context: {} },
  )
  if (typeof output === 'object' && output !== null && Symbol.asyncIterator in output) {
    throw new Error('calculator 不应返回流式结果')
  }
  return output as CalculatorOutput
}

describe('createCalculatorTool', () => {
  it('返回原始数值结果与格式化文本', async () => {
    await expect(executeCalculator('(128*3*0.85-40)')).resolves.toEqual({
      expression: '(128*3*0.85-40)',
      result: 286.4,
      formatted: '286.4',
    })
  })

  it('formatted 先取 12 位精度再按 zh-CN 格式化', async () => {
    const output = await executeCalculator('0.1+0.2')
    expect(output.result).toBeCloseTo(0.3)
    expect(output.formatted).toBe('0.3')
    const large = await executeCalculator('1234567.891')
    expect(large.formatted).toBe('1,234,567.891')
  })

  it('round 结果带千分位', async () => {
    const output = await executeCalculator('round(12345.678, 2)')
    expect(output.result).toBeCloseTo(12345.68)
    expect(output.formatted).toBe('12,345.68')
  })

  it('求值失败时抛出固定错误', async () => {
    await expect(executeCalculator('1/0')).rejects.toThrow('结果不是有限数')
    await expect(executeCalculator('sqrt(-1)')).rejects.toThrow('结果不是有限数')
    await expect(executeCalculator('foo(1)')).rejects.toThrow('未知函数或常量：foo')
  })

  it('description 按任务书逐字声明', () => {
    const calculator = createCalculatorTool()
    expect(calculator.description).toBe(
      '精确计算数学表达式。涉及金额、比例、增长率、单位换算等数值时必须调用，不要心算。支持 + - * / ^、括号、pi、e，以及 sqrt abs round floor ceil min max ln log10 exp pow；百分比请写成小数乘法，例如 85% 写作 *0.85。',
    )
  })

  it('inputSchema 限制 1..200 字符', async () => {
    await expect(executeCalculator('')).rejects.toThrow()
    await expect(executeCalculator('1'.repeat(201))).rejects.toThrow()
  })
})

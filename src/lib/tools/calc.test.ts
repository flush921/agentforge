import { describe, expect, it } from 'vitest'

import { evaluateExpression } from './calc'

function value(expression: string): number {
  const result = evaluateExpression(expression)
  if (!result.ok) {
    throw new Error(`预期求值成功，实际报错：${result.error}`)
  }
  return result.value
}

function error(expression: string): string {
  const result = evaluateExpression(expression)
  if (result.ok) {
    throw new Error(`预期求值失败，实际得到 ${result.value}`)
  }
  return result.error
}

describe('evaluateExpression 优先级与结合性', () => {
  it('加减乘除优先级', () => {
    expect(value('1+2*3')).toBe(7)
    expect(value('(1+2)*3')).toBe(9)
    expect(value('10-6/2')).toBe(7)
  })

  it('^ 右结合：2^3^2 = 512', () => {
    expect(value('2^3^2')).toBe(512)
  })

  it('一元负号优先级低于 ^：-2^2 = -4', () => {
    expect(value('-2^2')).toBe(-4)
  })

  it('^ 右操作数允许为负数：2^-3', () => {
    expect(value('2^-3')).toBeCloseTo(0.125)
  })

  it('一元加号与多重符号', () => {
    expect(value('+3')).toBe(3)
    expect(value('--3')).toBe(3)
    expect(value('-(-3)')).toBe(3)
  })
})

describe('evaluateExpression 小数与空白', () => {
  it('小数运算', () => {
    expect(value('0.1+0.2')).toBeCloseTo(0.3)
    expect(value('.5*4')).toBe(2)
    expect(value('3.')).toBe(3)
  })

  it('忽略空白字符', () => {
    expect(value(' 1 + 2 * 3 ')).toBe(7)
    expect(value('sqrt( 4 )')).toBe(2)
  })
})

describe('evaluateExpression 常量', () => {
  it('pi', () => {
    expect(value('pi')).toBeCloseTo(Math.PI)
    expect(value('2*pi')).toBeCloseTo(2 * Math.PI)
  })

  it('e', () => {
    expect(value('e')).toBeCloseTo(Math.E)
    expect(value('ln(e)')).toBeCloseTo(1)
  })
})

describe('evaluateExpression 函数', () => {
  it('sqrt', () => {
    expect(value('sqrt(9)')).toBe(3)
    expect(value('sqrt(2)')).toBeCloseTo(Math.SQRT2)
  })

  it('abs', () => {
    expect(value('abs(-5)')).toBe(5)
    expect(value('abs(3-10)')).toBe(7)
  })

  it('round 一位参数', () => {
    expect(value('round(2.5)')).toBe(3)
    expect(value('round(-2.5)')).toBe(-2)
  })

  it('round 两位参数', () => {
    expect(value('round(3.14159, 2)')).toBeCloseTo(3.14)
    expect(value('round(2.675, 2)')).toBeCloseTo(2.68)
    expect(value('round(1234, -2)')).toBe(1200)
  })

  it('floor / ceil', () => {
    expect(value('floor(3.7)')).toBe(3)
    expect(value('ceil(3.2)')).toBe(4)
    expect(value('floor(-1.5)')).toBe(-2)
  })

  it('min / max', () => {
    expect(value('min(3, 1, 2)')).toBe(1)
    expect(value('max(3, 1, 2)')).toBe(3)
    expect(value('min(5)')).toBe(5)
    expect(value('max(-1, 1)')).toBe(1)
  })

  it('ln / log10 / exp', () => {
    expect(value('ln(1)')).toBe(0)
    expect(value('log10(1000)')).toBe(3)
    expect(value('exp(0)')).toBe(1)
    expect(value('exp(1)')).toBeCloseTo(Math.E)
  })

  it('pow', () => {
    expect(value('pow(2, 10)')).toBe(1024)
    expect(value('pow(9, 0.5)')).toBe(3)
  })

  it('函数嵌套与组合', () => {
    expect(value('sqrt(abs(-16)) + max(pow(2, 3), 5)')).toBe(12)
  })
})

describe('evaluateExpression 参数个数错误', () => {
  it('单参数函数传参错误', () => {
    expect(error('sqrt()')).toBe('sqrt 需要 1 个参数，实际 0 个')
    expect(error('sqrt(1, 2)')).toBe('sqrt 需要 1 个参数，实际 2 个')
    expect(error('abs(1, 2, 3)')).toBe('abs 需要 1 个参数，实际 3 个')
  })

  it('round 参数错误', () => {
    expect(error('round(1, 2, 3)')).toBe('round 需要 1 或 2 个参数，实际 3 个')
  })

  it('pow 参数错误', () => {
    expect(error('pow(2)')).toBe('pow 需要 2 个参数，实际 1 个')
    expect(error('pow(1, 2, 3)')).toBe('pow 需要 2 个参数，实际 3 个')
  })

  it('min / max 至少一个参数', () => {
    expect(error('min()')).toBe('min 至少需要 1 个参数')
    expect(error('max()')).toBe('max 至少需要 1 个参数')
  })
})

describe('evaluateExpression 全角输入', () => {
  it('全角运算符与括号', () => {
    expect(value('（1＋2）×3')).toBe(9)
    expect(value('10÷4')).toBe(2.5)
  })

  it('全角乘除与逗号', () => {
    expect(value('10＊2')).toBe(20)
    expect(value('20／4')).toBe(5)
    expect(value('round（3.14159，2）')).toBeCloseTo(3.14)
  })
})

describe('evaluateExpression 错误场景', () => {
  it('空串', () => {
    expect(error('')).toBe('表达式为空')
    expect(error('   ')).toBe('表达式为空')
  })

  it('超长', () => {
    expect(error('1'.repeat(201))).toBe('表达式超过 200 字符限制')
    expect(value(`${'1+'.repeat(99)}1`)).toBe(100)
  })

  it('非法字符', () => {
    expect(error('1%2')).toBe('包含不支持的字符')
    expect(error('1；2')).toBe('包含不支持的字符')
    expect(error('1＝2')).toBe('包含不支持的字符')
    expect(error('1$2')).toBe('包含不支持的字符')
    expect(error('1#2')).toBe('包含不支持的字符')
  })

  it('未知标识符', () => {
    expect(error('foo(1)')).toBe('未知函数或常量：foo')
    expect(error('1 + bar')).toBe('未知函数或常量：bar')
  })

  it('未知标识符截断到 20 字', () => {
    const longName = 'a'.repeat(30)
    expect(error(longName)).toBe(`未知函数或常量：${'a'.repeat(20)}`)
  })

  it('括号不匹配', () => {
    expect(error('(1+2')).toBe('括号不匹配')
    expect(error('1+2)')).toBe('括号不匹配')
    expect(error('((1)')).toBe('括号不匹配')
    expect(error('sqrt(4')).toBe('括号不匹配')
    expect(error('sqrt(4,)')).toBe('表达式语法错误')
  })

  it('嵌套过深', () => {
    expect(value('('.repeat(32) + '1' + ')'.repeat(32))).toBe(1)
    expect(error('('.repeat(33) + '1' + ')'.repeat(33))).toBe('括号嵌套过深')
  })

  it('除零', () => {
    expect(error('1/0')).toBe('结果不是有限数')
    expect(error('5/(2-2)')).toBe('结果不是有限数')
  })

  it('结果不是有限数：负数开方与溢出', () => {
    expect(error('sqrt(-1)')).toBe('结果不是有限数')
    expect(error('ln(0)')).toBe('结果不是有限数')
    expect(error('exp(10000)')).toBe('结果不是有限数')
    expect(error('pow(10, 500)')).toBe('结果不是有限数')
  })

  it('键名攻击：constructor / __proto__ / toString', () => {
    expect(error('constructor')).toBe('未知函数或常量：constructor')
    expect(error('__proto__')).toBe('未知函数或常量：__proto__')
    expect(error('toString')).toBe('未知函数或常量：toString')
    expect(error('constructor(1)')).toBe('未知函数或常量：constructor')
    expect(error('toString(1)')).toBe('未知函数或常量：toString')
  })
})

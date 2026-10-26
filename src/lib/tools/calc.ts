export type CalcResult = { ok: true; value: number } | { ok: false; error: string }

const MAX_LENGTH = 200
const MAX_DEPTH = 32

class CalcError extends Error {}

const FULL_WIDTH_MAP = new Map<string, string>([
  ['（', '('],
  ['）', ')'],
  ['＋', '+'],
  ['－', '-'],
  ['×', '*'],
  ['÷', '/'],
  ['＊', '*'],
  ['／', '/'],
  ['，', ','],
])

const CONSTANTS = new Map<string, number>([
  ['pi', Math.PI],
  ['e', Math.E],
])

const FUNCTIONS = new Map<string, (args: number[]) => number>([
  ['sqrt', ([x]) => Math.sqrt(x!)],
  ['abs', ([x]) => Math.abs(x!)],
  [
    'round',
    ([x, digits]) => {
      if (digits === undefined) {
        return Math.round(x!)
      }
      const factor = 10 ** digits
      return Math.round(x! * factor) / factor
    },
  ],
  ['floor', ([x]) => Math.floor(x!)],
  ['ceil', ([x]) => Math.ceil(x!)],
  ['min', (args) => Math.min(...args)],
  ['max', (args) => Math.max(...args)],
  ['ln', ([x]) => Math.log(x!)],
  ['log10', ([x]) => Math.log10(x!)],
  ['exp', ([x]) => Math.exp(x!)],
  ['pow', ([x, y]) => Math.pow(x!, y!)],
])

const ARITY = new Map<string, number[]>([
  ['sqrt', [1]],
  ['abs', [1]],
  ['round', [1, 2]],
  ['floor', [1]],
  ['ceil', [1]],
  ['min', []],
  ['max', []],
  ['ln', [1]],
  ['log10', [1]],
  ['exp', [1]],
  ['pow', [2]],
])

const ALLOWED_CHAR = /[0-9A-Za-z_+\-*/^(),.\s]/

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' | '^' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]!

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    if (/[0-9.]/.test(char)) {
      const match = /^\d+\.\d+|^\d+\.|^\.\d+|^\d+/.exec(source.slice(index))
      if (match === null) {
        throw new CalcError('表达式语法错误')
      }
      tokens.push({ kind: 'num', value: Number(match[0]) })
      index += match[0].length
      continue
    }

    if (/[A-Za-z_]/.test(char)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index))!
      tokens.push({ kind: 'ident', name: match[0] })
      index += match[0].length
      continue
    }

    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '^') {
      tokens.push({ kind: 'op', op: char })
      index += 1
      continue
    }

    if (char === '(') {
      tokens.push({ kind: 'lparen' })
      index += 1
      continue
    }

    if (char === ')') {
      tokens.push({ kind: 'rparen' })
      index += 1
      continue
    }

    if (char === ',') {
      tokens.push({ kind: 'comma' })
      index += 1
      continue
    }

    throw new CalcError('包含不支持的字符')
  }

  return tokens
}

function parse(tokens: Token[]): number {
  let position = 0
  let depth = 0

  function peek(): Token | undefined {
    return tokens[position]
  }

  function take(): Token {
    const token = tokens[position]
    if (token === undefined) {
      throw new CalcError(depth > 0 ? '括号不匹配' : '表达式语法错误')
    }
    position += 1
    return token
  }

  function enterGroup(): void {
    depth += 1
    if (depth > MAX_DEPTH) {
      throw new CalcError('括号嵌套过深')
    }
  }

  function parseExpression(): number {
    let value = parseTerm()
    for (;;) {
      const token = peek()
      if (token?.kind !== 'op' || (token.op !== '+' && token.op !== '-')) {
        return value
      }
      take()
      value = token.op === '+' ? value + parseTerm() : value - parseTerm()
    }
  }

  function parseTerm(): number {
    let value = parseUnary()
    for (;;) {
      const token = peek()
      if (token?.kind !== 'op' || (token.op !== '*' && token.op !== '/')) {
        return value
      }
      take()
      value = token.op === '*' ? value * parseUnary() : value / parseUnary()
    }
  }

  function parseUnary(): number {
    const token = peek()
    if (token?.kind === 'op' && (token.op === '+' || token.op === '-')) {
      take()
      const operand = parseUnary()
      return token.op === '-' ? -operand : operand
    }
    return parsePower()
  }

  function parsePower(): number {
    const base = parsePrimary()
    const token = peek()
    if (token?.kind === 'op' && token.op === '^') {
      take()
      return base ** parseUnary()
    }
    return base
  }

  function parseArguments(): number[] {
    const args: number[] = []
    if (peek()?.kind === 'rparen') {
      take()
      return args
    }
    for (;;) {
      args.push(parseExpression())
      const token = take()
      if (token.kind === 'rparen') {
        return args
      }
      if (token.kind !== 'comma') {
        throw new CalcError('括号不匹配')
      }
    }
  }

  function parsePrimary(): number {
    const token = take()
    if (token.kind === 'num') {
      return token.value
    }
    if (token.kind === 'ident') {
      if (peek()?.kind === 'lparen') {
        const implementation = FUNCTIONS.get(token.name)
        if (implementation === undefined) {
          throw new CalcError(`未知函数或常量：${token.name.slice(0, 20)}`)
        }
        take()
        enterGroup()
        const args = parseArguments()
        depth -= 1
        const counts = ARITY.get(token.name)!
        if (counts.length === 0) {
          if (args.length < 1) {
            throw new CalcError(`${token.name} 至少需要 1 个参数`)
          }
        } else if (!counts.includes(args.length)) {
          throw new CalcError(
            `${token.name} 需要 ${counts.join(' 或 ')} 个参数，实际 ${args.length} 个`,
          )
        }
        return implementation(args)
      }
      const constant = CONSTANTS.get(token.name)
      if (constant === undefined) {
        throw new CalcError(`未知函数或常量：${token.name.slice(0, 20)}`)
      }
      return constant
    }
    if (token.kind === 'lparen') {
      enterGroup()
      const value = parseExpression()
      const closing = take()
      depth -= 1
      if (closing.kind !== 'rparen') {
        throw new CalcError('括号不匹配')
      }
      return value
    }
    throw new CalcError('表达式语法错误')
  }

  const result = parseExpression()
  if (position < tokens.length) {
    if (tokens[position]?.kind === 'rparen') {
      throw new CalcError('括号不匹配')
    }
    throw new CalcError('表达式语法错误')
  }
  return result
}

export function evaluateExpression(expression: string): CalcResult {
  if (expression.length > MAX_LENGTH) {
    return { ok: false, error: '表达式超过 200 字符限制' }
  }

  let normalized = ''
  for (const char of expression) {
    normalized += FULL_WIDTH_MAP.get(char) ?? char
  }

  if (normalized.trim().length === 0) {
    return { ok: false, error: '表达式为空' }
  }

  for (const char of normalized) {
    if (!ALLOWED_CHAR.test(char)) {
      return { ok: false, error: '包含不支持的字符' }
    }
  }

  try {
    const value = parse(tokenize(normalized))
    if (!Number.isFinite(value)) {
      return { ok: false, error: '结果不是有限数' }
    }
    return { ok: true, value }
  } catch (error) {
    if (error instanceof CalcError) {
      return { ok: false, error: error.message }
    }
    throw error
  }
}

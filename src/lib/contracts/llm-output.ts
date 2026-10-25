import { z } from 'zod'

export type LlmParseResult<T> =
  { ok: true; data: T; repairs: string[] } | { ok: false; error: string }

type Issue = z.ZodError['issues'][number]

function formatPath(path: PropertyKey[]): string {
  return path.length === 0 ? '(root)' : path.join('.')
}

export function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${formatPath(issue.path)}: ${issue.message}`).join('；')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getAtPath(root: unknown, path: PropertyKey[]): unknown {
  let current = root

  for (const segment of path) {
    if (typeof current !== 'object' || current === null) {
      return undefined
    }
    current = Reflect.get(current, segment)
  }

  return current
}

function setAtPath(root: unknown, path: PropertyKey[], value: unknown): boolean {
  if (path.length === 0) {
    return false
  }

  const parent = getAtPath(root, path.slice(0, -1))
  const key = path[path.length - 1]
  if (key === undefined || typeof parent !== 'object' || parent === null) {
    return false
  }

  return Object.prototype.hasOwnProperty.call(parent, key) && Reflect.set(parent, key, value)
}

function repairIssue(root: unknown, issue: Issue): string | null {
  if (issue.code === 'unrecognized_keys') {
    const target = getAtPath(root, issue.path)
    if (!isRecord(target)) {
      return null
    }

    const deleted = issue.keys.filter((key) => {
      if (!Object.prototype.hasOwnProperty.call(target, key)) {
        return false
      }
      return Reflect.deleteProperty(target, key)
    })
    return deleted.length > 0
      ? `删除 ${formatPath(issue.path)} 的多余字段：${deleted.join('、')}`
      : null
  }

  if (issue.code !== 'too_big' || typeof issue.maximum !== 'number') {
    return null
  }

  const value = getAtPath(root, issue.path)
  if (issue.origin === 'string' && typeof value === 'string') {
    if (!setAtPath(root, issue.path, value.slice(0, issue.maximum))) {
      return null
    }
    return `将 ${formatPath(issue.path)} 的字符串截断至 ${issue.maximum} 个字符`
  }

  if (issue.origin === 'array' && Array.isArray(value)) {
    if (!setAtPath(root, issue.path, value.slice(0, issue.maximum))) {
      return null
    }
    return `将 ${formatPath(issue.path)} 的数组截断至 ${issue.maximum} 项`
  }

  return null
}

function extractJson(text: string): string {
  const trimmed = text.trim()
  const codeBlock = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  if (codeBlock) {
    return (codeBlock[1] ?? '').trim()
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed
}

export function parseLlmOutput<T>(schema: z.ZodType<T>, text: string): LlmParseResult<T> {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(text))
  } catch {
    return { ok: false, error: 'JSON 解析失败' }
  }

  // 所有修复都作用于克隆，避免把解析过程产生的修改泄漏给调用方。
  const candidate = structuredClone(parsed)
  const repairs: string[] = []
  let lastError: z.ZodError | undefined

  for (let round = 0; round < 3; round += 1) {
    const result = schema.safeParse(candidate)
    if (result.success) {
      return { ok: true, data: result.data, repairs }
    }
    lastError = result.error

    let repaired = false
    for (const issue of result.error.issues) {
      const repair = repairIssue(candidate, issue)
      if (repair === null) {
        return { ok: false, error: formatIssues(result.error) }
      }
      repairs.push(repair)
      repaired = true
    }

    if (!repaired) {
      return { ok: false, error: formatIssues(result.error) }
    }
  }

  return lastError
    ? { ok: false, error: formatIssues(lastError) }
    : { ok: false, error: 'JSON 解析失败' }
}

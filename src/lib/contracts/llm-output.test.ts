import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { formatIssues, parseLlmOutput } from './llm-output'

const schema = z.strictObject({
  name: z.string().trim().min(1).max(5),
  tags: z.array(z.string()).max(2),
  mode: z.enum(['a', 'b']),
})
const validJson = '{"name":"名字","tags":["一"],"mode":"a"}'
const validData = { name: '名字', tags: ['一'], mode: 'a' }

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) {
      deepFreeze(nested)
    }
  }
  return value
}

describe('parseLlmOutput', () => {
  it('提取 json 代码块', () => {
    expect(parseLlmOutput(schema, `说明\n\`\`\`json\n${validJson}\n\`\`\``)).toEqual({
      ok: true,
      data: validData,
      repairs: [],
    })
  })

  it('提取无语言标记的代码块', () => {
    expect(parseLlmOutput(schema, `\`\`\`\n${validJson}\n\`\`\``)).toEqual({
      ok: true,
      data: validData,
      repairs: [],
    })
  })

  it('提取前后说明文字中的 JSON 对象', () => {
    expect(parseLlmOutput(schema, `前面${validJson}后面`)).toEqual({
      ok: true,
      data: validData,
      repairs: [],
    })
  })

  it('截断超长字符串和数组并记录 repairs', () => {
    const result = parseLlmOutput(
      schema,
      JSON.stringify({ name: 'abcdefgh', tags: ['一', '二', '三'], mode: 'a' }),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual({ name: 'abcde', tags: ['一', '二'], mode: 'a' })
      expect(result.repairs).toHaveLength(2)
      expect(result.repairs.join('；')).toContain('字符串')
      expect(result.repairs.join('；')).toContain('数组')
    }
  })

  it('删除多余键并记录字段路径', () => {
    const nestedSchema = z.strictObject({
      profile: z.strictObject({ name: z.string().max(5) }),
    })
    const result = parseLlmOutput(
      nestedSchema,
      JSON.stringify({ profile: { name: '名字', extra: true } }),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual({ profile: { name: '名字' } })
      expect(result.repairs[0]).toContain('profile')
      expect(result.repairs[0]).toContain('extra')
    }
  })

  it('缺少必填字段时返回带路径的错误', () => {
    const result = parseLlmOutput(schema, '{"tags":[],"mode":"a"}')
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) {
      expect(result.error).toContain('name')
    }
  })

  it('错误枚举不可修复并返回带路径的错误', () => {
    const result = parseLlmOutput(schema, '{"name":"名字","tags":[],"mode":"other"}')
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) {
      expect(result.error).toContain('mode')
    }
  })

  it('输入不是 JSON 时返回 JSON 解析失败', () => {
    expect(parseLlmOutput(schema, '不是 JSON')).toEqual({ ok: false, error: 'JSON 解析失败' })
  })

  it('不修改传入的对象', () => {
    const input = deepFreeze({ name: 'abcdefgh', tags: ['一', '二', '三'], mode: 'a', extra: true })
    const snapshot = structuredClone(input)
    const result = parseLlmOutput(schema, JSON.stringify(input))

    expect(result.ok).toBe(true)
    expect(input).toEqual(snapshot)
  })
})

describe('formatIssues', () => {
  it('根路径写作 (root)', () => {
    const result = z.strictObject({}).safeParse({ extra: true })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(formatIssues(result.error)).toContain('(root)')
    }
  })
})

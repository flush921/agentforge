import { describe, expect, it } from 'vitest'
import { parseEnv } from './env-schema'

describe('parseEnv', () => {
  it('使用 mock 和模型名称默认值', () => {
    const env = parseEnv({})

    expect(env.LLM_MODE).toBe('mock')
    expect(env.LLM_BASE_URL).toBeUndefined()
    expect(env.LLM_API_KEY).toBeUndefined()
    expect(env.LLM_MODEL).toBe('deepseek-v4.1-flash')
    expect(env.ACCESS_CODE).toBeUndefined()
  })

  it('live 模式要求合法的 base URL', () => {
    expect(() => parseEnv({ LLM_MODE: 'live', LLM_API_KEY: 'unit-test-key' })).toThrowError(
      'LLM_BASE_URL',
    )
    expect(() =>
      parseEnv({
        LLM_MODE: 'live',
        LLM_BASE_URL: 'not-a-url',
        LLM_API_KEY: 'unit-test-key',
      }),
    ).toThrowError('LLM_BASE_URL')
  })

  it('live 模式缺少非空 key 时报告变量名', () => {
    const base = { LLM_MODE: 'live', LLM_BASE_URL: 'https://example.invalid/v1' }
    expect(() => parseEnv(base)).toThrowError('LLM_API_KEY')
    expect(() => parseEnv({ ...base, LLM_API_KEY: '   ' })).toThrowError('LLM_API_KEY')
  })

  it('live 配置完整时保留接入字段', () => {
    const env = parseEnv({
      LLM_MODE: 'live',
      LLM_BASE_URL: 'https://example.invalid/v1',
      LLM_API_KEY: 'unit-test-key',
    })

    expect(env).toMatchObject({
      LLM_MODE: 'live',
      LLM_BASE_URL: 'https://example.invalid/v1',
      LLM_API_KEY: 'unit-test-key',
      LLM_MODEL: 'deepseek-v4.1-flash',
    })
  })

  it('将空 ACCESS_CODE 转为 undefined', () => {
    expect(parseEnv({ ACCESS_CODE: '' }).ACCESS_CODE).toBeUndefined()
  })

  it('错误信息不包含密钥值', () => {
    const secret = 'test-secret-key'
    let thrown: unknown

    try {
      parseEnv({ LLM_MODE: 'invalid', LLM_API_KEY: secret })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    if (thrown instanceof Error) {
      expect(thrown.message).toContain('LLM_MODE')
      expect(thrown.message).not.toContain(secret)
    }
  })
})

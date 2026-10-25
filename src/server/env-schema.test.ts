import { describe, expect, it } from 'vitest'
import { parseEnv } from './env-schema'

describe('parseEnv', () => {
  it('使用 mock 和模型名称默认值', () => {
    const env = parseEnv({})

    expect(env.LLM_MODE).toBe('mock')
    expect(env.DEEPSEEK_MODEL).toBe('deepseek-v4-flash')
    expect(env.DEEPSEEK_API_KEY).toBeUndefined()
    expect(env.ACCESS_CODE).toBeUndefined()
  })

  it('live 模式缺少非空 key 时报告变量名', () => {
    expect(() => parseEnv({ LLM_MODE: 'live' })).toThrowError('DEEPSEEK_API_KEY')
    expect(() => parseEnv({ LLM_MODE: 'live', DEEPSEEK_API_KEY: '   ' })).toThrowError(
      'DEEPSEEK_API_KEY',
    )
  })

  it('将空 ACCESS_CODE 转为 undefined', () => {
    expect(parseEnv({ ACCESS_CODE: '' }).ACCESS_CODE).toBeUndefined()
  })

  it('错误信息不包含密钥值', () => {
    const secret = 'test-secret-key'
    let thrown: unknown

    try {
      parseEnv({ LLM_MODE: 'invalid', DEEPSEEK_API_KEY: secret })
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

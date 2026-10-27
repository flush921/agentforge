import { describe, expect, it } from 'vitest'
import { parseEvalConfig } from './eval-config'

describe('parseEvalConfig', () => {
  it.each([
    { env: { EVAL_SET: 'dev', EVAL_TAG: 'dev-v13', EVAL_GUARD: '0' }, guard: false },
    { env: { EVAL_SET: 'holdout', EVAL_TAG: 'holdout-v13', EVAL_GUARD: '1' }, guard: true },
  ])('解析 $env.EVAL_SET / guard=$env.EVAL_GUARD', ({ env, guard }) => {
    expect(parseEvalConfig(env)).toEqual({ set: env.EVAL_SET, tag: env.EVAL_TAG, guard })
  })

  it.each([
    {},
    { EVAL_SET: 'other', EVAL_TAG: 'valid', EVAL_GUARD: '0' },
    { EVAL_SET: 'dev', EVAL_TAG: '../escape', EVAL_GUARD: '0' },
    { EVAL_SET: 'dev', EVAL_TAG: 'UPPER', EVAL_GUARD: '0' },
    { EVAL_SET: 'dev', EVAL_TAG: 'a'.repeat(33), EVAL_GUARD: '0' },
    { EVAL_SET: 'dev', EVAL_TAG: 'valid', EVAL_GUARD: 'yes' },
  ])('拒绝无效配置 %#', (env) => {
    expect(() => parseEvalConfig(env)).toThrow()
  })
})

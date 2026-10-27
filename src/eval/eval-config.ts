export interface EvalConfig {
  set: 'dev' | 'holdout'
  tag: string
  guard: boolean
}

export function parseEvalConfig(env: Readonly<Record<string, string | undefined>>): EvalConfig {
  const { EVAL_SET: set, EVAL_TAG: tag, EVAL_GUARD: guard } = env
  if (set !== 'dev' && set !== 'holdout') {
    throw new Error('EVAL_SET 必须是 dev 或 holdout')
  }
  if (tag === undefined || !/^[a-z0-9-]{1,32}$/.test(tag)) {
    throw new Error('EVAL_TAG 只能包含 1..32 位小写字母、数字和连字符')
  }
  if (guard !== '0' && guard !== '1') {
    throw new Error('EVAL_GUARD 必须是 0 或 1')
  }
  return { set, tag, guard: guard === '1' }
}

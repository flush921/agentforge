import 'server-only'

import { getEnv } from '@/server/env'
import { createDeepSeekClient } from './deepseek'
import { createMockClient } from './mock'
import type { LlmClient } from './types'

let cachedLlm: LlmClient | undefined

export function getLlm(): LlmClient {
  if (cachedLlm === undefined) {
    const env = getEnv()
    cachedLlm = env.LLM_MODE === 'mock' ? createMockClient() : createDeepSeekClient(env)
  }

  return cachedLlm
}

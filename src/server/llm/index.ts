import 'server-only'

import { getEnv } from '@/server/env'
import { createLiveClient } from './openai-compatible'
import { createMockClient } from './mock'
import type { LlmClient } from './types'

let cachedLlm: LlmClient | undefined

export function getLlm(): LlmClient {
  if (cachedLlm === undefined) {
    const env = getEnv()
    cachedLlm = env.LLM_MODE === 'mock' ? createMockClient() : createLiveClient(env)
  }

  return cachedLlm
}

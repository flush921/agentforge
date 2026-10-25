import 'server-only'

import type { Usage } from '@/lib/contracts/common'

export type LlmKind = 'generate' | 'assess' | 'plan'

export interface LlmJsonRequest {
  kind: LlmKind
  instructions: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  temperature: number
  maxOutputTokens: number
  signal: AbortSignal
}

export interface LlmJsonResult {
  text: string
  usage: Usage
}

export interface LlmClient {
  mode: 'mock' | 'live'
  generateJson(req: LlmJsonRequest): Promise<LlmJsonResult>
}

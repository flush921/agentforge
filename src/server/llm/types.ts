import 'server-only'

import type { ToolName, Usage } from '@/lib/contracts/common'

export type LlmKind = 'generate' | 'assess' | 'plan' | 'review'

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

export interface AgentLlmRequest {
  instructions: string
  messages: Array<{ role: 'user'; content: string }>
  tools: ToolName[]
  thinking: boolean
  maxOutputTokens: number
  signal: AbortSignal
}

export type AgentStreamPart =
  | { type: 'step-start' }
  | { type: 'reasoning'; delta: string }
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; callId: string; tool: ToolName; input: unknown }
  | { type: 'tool_result'; callId: string; ok: boolean; summary: string }
  | { type: 'finish'; usage: Usage }

export interface LlmClient {
  mode: 'mock' | 'live'
  generateJson(req: LlmJsonRequest): Promise<LlmJsonResult>
  streamAgent(req: AgentLlmRequest): AsyncIterable<AgentStreamPart>
}

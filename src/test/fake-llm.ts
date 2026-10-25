import type { LlmClient, LlmJsonRequest, LlmJsonResult } from '@/server/llm/types'

type FakeReply = string | Error | LlmJsonResult

export function fakeLlm(replies: FakeReply[]): { client: LlmClient; requests: LlmJsonRequest[] } {
  const requests: LlmJsonRequest[] = []
  const client: LlmClient = {
    mode: 'mock',
    async generateJson(req) {
      requests.push({ ...req, messages: req.messages.map((message) => ({ ...message })) })
      const reply = replies[requests.length - 1]
      if (reply === undefined) {
        throw new Error('unexpected_llm_call')
      }
      if (reply instanceof Error) {
        throw reply
      }
      if (typeof reply === 'string') {
        return { text: reply, usage: { inputTokens: 0, outputTokens: 0 } }
      }
      return reply
    },
  }

  return { client, requests }
}

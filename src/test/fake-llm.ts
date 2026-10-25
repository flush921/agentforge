import type {
  AgentLlmRequest,
  AgentStreamPart,
  LlmClient,
  LlmJsonRequest,
  LlmJsonResult,
} from '@/server/llm/types'

type FakeReply = string | Error | LlmJsonResult
type FakeStream = AgentStreamPart[] | Error

export function fakeLlm(
  replies: FakeReply[],
  streams: FakeStream[] = [],
): {
  client: LlmClient
  requests: LlmJsonRequest[]
  streamRequests: AgentLlmRequest[]
} {
  const requests: LlmJsonRequest[] = []
  const streamRequests: AgentLlmRequest[] = []
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
    async *streamAgent(req) {
      streamRequests.push({ ...req, messages: req.messages.map((message) => ({ ...message })) })
      const stream = streams[streamRequests.length - 1]
      if (stream === undefined) {
        throw new Error('unexpected_stream_call')
      }
      if (stream instanceof Error) {
        throw stream
      }
      for (const part of stream) {
        yield part
      }
    },
  }

  return { client, requests, streamRequests }
}

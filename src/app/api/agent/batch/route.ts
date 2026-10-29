export const dynamic = 'force-dynamic'
export const maxDuration = 300

import {
  agentBatchLineSchema,
  agentBatchRequestSchema,
  type AgentBatchLine,
  type AgentBatchRequest,
} from '@/lib/contracts/api'
import { encodeNdjsonLine } from '@/lib/stream/ndjson'
import { checkAccess } from '@/server/access'
import { getEnv } from '@/server/env'
import { jsonError, readJson } from '@/server/http'
import { getLlm } from '@/server/llm'
import { toApiError } from '@/server/llm/errors'
import { checkRateLimit, getClientKey, rateLimitedResponse } from '@/server/rate-limit'
import { runAgentBatch } from '@/server/services/batch'

const ROUTE = '/api/agent/batch'

/**
 * Ultra 的批量步骤接口：一次请求同时执行多个子 Agent，事件合并在一条 NDJSON 流里返回。
 * 浏览器对同一来源只开 6 条 HTTP/1.1 连接，逐个请求时多路并行会排队；合并后不受这个限制。
 */
export async function POST(request: Request): Promise<Response> {
  let body: { ok: true; data: AgentBatchRequest } | { ok: false; response: Response }
  try {
    const denied = checkAccess(request, getEnv())
    if (denied) {
      return denied
    }

    body = await readJson(request, agentBatchRequestSchema)
    if (!body.ok) {
      return body.response
    }

    const limited = checkRateLimit('run', getClientKey(request), Date.now(), body.data.steps.length)
    if (!limited.ok) {
      return rateLimitedResponse(limited.retryAfterSec)
    }
  } catch (error) {
    const mapped = toApiError(error, request.signal, ROUTE)
    return jsonError(mapped.error, mapped.status)
  }

  const encoder = new TextEncoder()
  const steps = body.data.steps
  let iterator: AsyncGenerator<AgentBatchLine> | undefined
  const getIterator = () => (iterator ??= runAgentBatch(getLlm(), steps, request.signal))

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (request.signal.aborted) {
          await iterator?.return(undefined)
          controller.close()
          return
        }
        const { done, value } = await getIterator().next()
        if (done) {
          controller.close()
          return
        }
        controller.enqueue(encoder.encode(encodeNdjsonLine(agentBatchLineSchema.parse(value))))
      } catch (error) {
        if (request.signal.aborted) {
          controller.close()
          return
        }
        // 整条流出错时，给每个步骤都补一个错误结尾，客户端按步骤各自重试。
        const mapped = toApiError(error, request.signal, ROUTE)
        for (let i = 0; i < steps.length; i += 1) {
          controller.enqueue(
            encoder.encode(
              encodeNdjsonLine({
                i,
                event: { type: 'error', error: mapped.error, retryable: mapped.retryable },
              }),
            ),
          )
        }
        controller.close()
      }
    },
    async cancel() {
      await iterator?.return(undefined)
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  })
}

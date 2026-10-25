export const dynamic = 'force-dynamic'
export const maxDuration = 120

import {
  agentStepRequestSchema,
  stepEventSchema,
  type AgentStepRequest,
  type StepEvent,
} from '@/lib/contracts/api'
import { encodeNdjsonLine } from '@/lib/stream/ndjson'
import { jsonError, readJson } from '@/server/http'
import { getLlm } from '@/server/llm'
import { toApiError } from '@/server/llm/errors'
import { runAgentStep } from '@/server/services/step'

const ROUTE = '/api/agent/step'

export async function POST(request: Request): Promise<Response> {
  let body: { ok: true; data: AgentStepRequest } | { ok: false; response: Response }
  try {
    body = await readJson(request, agentStepRequestSchema)
  } catch (error) {
    const mapped = toApiError(error, request.signal, ROUTE)
    return jsonError(mapped.error, mapped.status)
  }
  if (!body.ok) {
    return body.response
  }

  const encoder = new TextEncoder()
  let iterator: AsyncGenerator<StepEvent> | undefined
  const getIterator = () =>
    (iterator ??= runAgentStep(getLlm(), body.data, request.signal)[Symbol.asyncIterator]())

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
        if (request.signal.aborted) {
          await iterator?.return(undefined)
          controller.close()
          return
        }

        let event: StepEvent
        try {
          event = stepEventSchema.parse(value)
        } catch (error) {
          const mapped = toApiError(error, request.signal, ROUTE)
          controller.enqueue(
            encoder.encode(
              encodeNdjsonLine({ type: 'error', error: mapped.error, retryable: mapped.retryable }),
            ),
          )
          controller.close()
          return
        }

        controller.enqueue(encoder.encode(encodeNdjsonLine(event)))
        if (event.type === 'done' || event.type === 'error') {
          controller.close()
        }
      } catch (error) {
        if (request.signal.aborted) {
          controller.close()
          return
        }
        const mapped = toApiError(error, request.signal, ROUTE)
        controller.enqueue(
          encoder.encode(
            encodeNdjsonLine({ type: 'error', error: mapped.error, retryable: mapped.retryable }),
          ),
        )
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

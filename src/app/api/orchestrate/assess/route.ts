export const dynamic = 'force-dynamic'

import { assessRequestSchema, assessResponseSchema } from '@/lib/contracts/api'
import { jsonError, jsonOk, readJson } from '@/server/http'
import { getLlm } from '@/server/llm'
import { toApiError } from '@/server/llm/errors'
import { assessTask } from '@/server/services/assess'

const ROUTE = '/api/orchestrate/assess'

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJson(request, assessRequestSchema)
    if (!body.ok) {
      return body.response
    }

    const result = await assessTask(getLlm(), body.data.assistant, body.data.task, request.signal)
    if (!result.ok) {
      const mapped = toApiError(result.error, request.signal, ROUTE)
      return jsonError(mapped.error, mapped.status)
    }

    return jsonOk(assessResponseSchema.parse({ assessment: result.value }))
  } catch (error) {
    const mapped = toApiError(error, request.signal, ROUTE)
    return jsonError(mapped.error, mapped.status)
  }
}

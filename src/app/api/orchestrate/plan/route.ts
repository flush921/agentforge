export const dynamic = 'force-dynamic'

import { planRequestSchema, planResponseSchema } from '@/lib/contracts/api'
import { jsonError, jsonOk, readJson } from '@/server/http'
import { getLlm } from '@/server/llm'
import { toApiError } from '@/server/llm/errors'
import { planTask } from '@/server/services/plan'

const ROUTE = '/api/orchestrate/plan'

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJson(request, planRequestSchema)
    if (!body.ok) {
      return body.response
    }

    const result = await planTask(
      getLlm(),
      body.data.assistant,
      body.data.task,
      body.data.level,
      body.data.assessment,
      request.signal,
    )
    if (!result.ok) {
      const mapped = toApiError(result.error, request.signal, ROUTE)
      return jsonError(mapped.error, mapped.status)
    }

    return jsonOk(planResponseSchema.parse(result.value))
  } catch (error) {
    const mapped = toApiError(error, request.signal, ROUTE)
    return jsonError(mapped.error, mapped.status)
  }
}

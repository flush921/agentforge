export const dynamic = 'force-dynamic'

import { planRequestSchema, planResponseSchema } from '@/lib/contracts/api'
import { checkAccess } from '@/server/access'
import { getEnv } from '@/server/env'
import { jsonError, jsonOk, readJson } from '@/server/http'
import { getLlm } from '@/server/llm'
import { toApiError } from '@/server/llm/errors'
import { checkRateLimit, getClientKey, rateLimitedResponse } from '@/server/rate-limit'
import { planTask } from '@/server/services/plan'

const ROUTE = '/api/orchestrate/plan'

export async function POST(request: Request): Promise<Response> {
  try {
    const denied = checkAccess(request, getEnv())
    if (denied) {
      return denied
    }

    const limited = checkRateLimit('run', getClientKey(request))
    if (!limited.ok) {
      return rateLimitedResponse(limited.retryAfterSec)
    }

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
      body.data.ultra === true ? { ultra: true } : {},
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

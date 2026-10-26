export const dynamic = 'force-dynamic'

import {
  assistantGenerateRequestSchema,
  assistantGenerateResponseSchema,
} from '@/lib/contracts/api'
import { checkAccess } from '@/server/access'
import { getEnv } from '@/server/env'
import { jsonError, jsonOk, readJson } from '@/server/http'
import { getLlm } from '@/server/llm'
import { toApiError } from '@/server/llm/errors'
import { checkRateLimit, getClientKey, rateLimitedResponse } from '@/server/rate-limit'
import { generateAssistant } from '@/server/services/generate'

const ROUTE = '/api/assistant/generate'

export async function POST(request: Request): Promise<Response> {
  try {
    const denied = checkAccess(request, getEnv())
    if (denied) {
      return denied
    }

    const limited = checkRateLimit('generate', getClientKey(request))
    if (!limited.ok) {
      return rateLimitedResponse(limited.retryAfterSec)
    }

    const body = await readJson(request, assistantGenerateRequestSchema)
    if (!body.ok) {
      return body.response
    }

    const result = await generateAssistant(getLlm(), body.data.prompt, request.signal)
    if (!result.ok) {
      const mapped = toApiError(result.error, request.signal, ROUTE)
      return jsonError(mapped.error, mapped.status)
    }

    return jsonOk(assistantGenerateResponseSchema.parse({ assistant: result.value }))
  } catch (error) {
    const mapped = toApiError(error, request.signal, ROUTE)
    return jsonError(mapped.error, mapped.status)
  }
}

export const dynamic = 'force-dynamic'

import {
  assistantGenerateRequestSchema,
  assistantGenerateResponseSchema,
} from '@/lib/contracts/api'
import { jsonError, jsonOk, readJson } from '@/server/http'
import { getLlm } from '@/server/llm'
import { toApiError } from '@/server/llm/errors'
import { generateAssistant } from '@/server/services/generate'

const ROUTE = '/api/assistant/generate'

export async function POST(request: Request): Promise<Response> {
  try {
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

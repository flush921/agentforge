import type { AssistantDraft } from '../contracts/assistant'
import { apiErrorBodySchema, assistantGenerateResponseSchema } from '../contracts/api'
import type { ApiError } from '../contracts/common'
import { ApiRequestError } from '../orchestrator/http-deps'

function internalError(): ApiError {
  return { code: 'internal', message: '服务内部错误' }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  )
}

async function responseError(response: Response): Promise<ApiError> {
  try {
    return apiErrorBodySchema.parse(await response.json()).error
  } catch (error) {
    if (isAbortError(error)) throw error
    return internalError()
  }
}

export async function generateAssistant(
  prompt: string,
  { signal, fetchImpl = fetch }: { signal: AbortSignal; fetchImpl?: typeof fetch },
): Promise<AssistantDraft> {
  const response = await fetchImpl('/api/assistant/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
    signal,
  })
  if (!response.ok) {
    throw new ApiRequestError(response.status, await responseError(response))
  }
  try {
    return assistantGenerateResponseSchema.parse(await response.json()).assistant
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiRequestError(response.status, internalError())
  }
}

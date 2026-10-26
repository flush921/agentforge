import type { AssistantDraft } from '../contracts/assistant'
import { apiErrorBodySchema, assistantGenerateResponseSchema } from '../contracts/api'
import type { ApiError } from '../contracts/common'
import { ApiRequestError } from '../orchestrator/http-deps'
import { getAccessCode, reportAccessRequired } from './access'

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
  {
    signal,
    accessCode = getAccessCode(),
    fetchImpl = fetch,
  }: { signal: AbortSignal; accessCode?: string; fetchImpl?: typeof fetch },
): Promise<AssistantDraft> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (accessCode) {
    headers['x-access-code'] = accessCode
  }
  const response = await fetchImpl('/api/assistant/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt }),
    signal,
  })
  if (!response.ok) {
    if (response.status === 401) reportAccessRequired()
    throw new ApiRequestError(response.status, await responseError(response))
  }
  try {
    return assistantGenerateResponseSchema.parse(await response.json()).assistant
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiRequestError(response.status, internalError())
  }
}

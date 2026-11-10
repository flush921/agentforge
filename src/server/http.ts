import 'server-only'

import { z } from 'zod'
import type { ApiError } from '@/lib/contracts/common'
import { formatIssues } from '@/lib/contracts/llm-output'

const MAX_BODY_LENGTH = 200_000

function badRequest(message: string): { ok: false; response: Response } {
  return { ok: false, response: jsonError({ code: 'bad_request', message }, 400) }
}

/** maxLength 默认 20 万；带上游材料的步骤接口和批量接口会传入更大的上限。 */
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxLength = MAX_BODY_LENGTH,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) > maxLength) {
    return badRequest('请求格式不正确')
  }

  const text = await request.text()
  if (text.length > maxLength) {
    return badRequest('请求格式不正确')
  }

  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return badRequest('请求格式不正确')
  }

  const result = schema.safeParse(value)
  if (!result.success) {
    return badRequest(formatIssues(result.error).slice(0, 500) || '请求格式不正确')
  }

  return { ok: true, data: result.data }
}

export function jsonError(apiError: ApiError, status: number): Response {
  return Response.json({ error: apiError }, { status })
}

export function jsonOk(body: unknown): Response {
  return Response.json(body)
}

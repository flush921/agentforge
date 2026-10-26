import type {
  AgentStepRequest,
  AssessRequest,
  AssessResponse,
  PlanRequest,
  PlanResponse,
  StepEvent,
} from '../contracts/api'
import {
  apiErrorBodySchema,
  assessResponseSchema,
  planResponseSchema,
  stepEventSchema,
} from '../contracts/api'
import type { ApiError } from '../contracts/common'
import { readNdjson } from '../stream/ndjson'

export interface OrchestratorDeps {
  assess(req: AssessRequest, signal: AbortSignal): Promise<AssessResponse>
  plan(req: PlanRequest, signal: AbortSignal): Promise<PlanResponse>
  step(req: AgentStepRequest, signal: AbortSignal): AsyncIterable<StepEvent>
  now(): number
  sleep(ms: number, signal: AbortSignal): Promise<void>
  newRunId(): string
}

interface HttpDepsOptions {
  baseUrl?: string
  accessCode?: string
  fetchImpl?: typeof fetch
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly apiError: ApiError,
  ) {
    super(`API 请求失败（${status}）`)
    this.name = 'ApiRequestError'
  }
}

function internalError(): ApiError {
  return { code: 'internal', message: '服务内部错误' }
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
  )
}

async function responseError(response: Response): Promise<ApiError> {
  try {
    return apiErrorBodySchema.parse(await response.json()).error
  } catch {
    return internalError()
  }
}

export function createHttpDeps(options: HttpDepsOptions = {}): OrchestratorDeps {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '')
  const fetchImpl = options.fetchImpl ?? fetch
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.accessCode) {
    headers['x-access-code'] = options.accessCode
  }

  function init(body: unknown, signal: AbortSignal): RequestInit {
    return { method: 'POST', headers, body: JSON.stringify(body), signal }
  }

  async function requestJson<T>(
    path: string,
    body: unknown,
    signal: AbortSignal,
    schema: { parse(value: unknown): T },
  ): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, init(body, signal))
    if (!response.ok) {
      throw new ApiRequestError(response.status, await responseError(response))
    }
    try {
      return schema.parse(await response.json())
    } catch {
      throw new ApiRequestError(response.status, internalError())
    }
  }

  return {
    assess: (req, signal) =>
      requestJson('/api/orchestrate/assess', req, signal, assessResponseSchema),
    plan: (req, signal) => requestJson('/api/orchestrate/plan', req, signal, planResponseSchema),
    async *step(req, signal) {
      let response: Response
      try {
        response = await fetchImpl(`${baseUrl}/api/agent/step`, init(req, signal))
      } catch (error) {
        if (isAbort(error, signal)) {
          throw error
        }
        yield {
          type: 'error',
          error: { code: 'upstream_error', message: '网络连接失败' },
          retryable: true,
        }
        return
      }

      if (!response.ok) {
        yield {
          type: 'error',
          error: await responseError(response),
          retryable: response.status === 429 || response.status >= 500,
        }
        return
      }
      if (response.body === null) {
        yield { type: 'error', error: internalError(), retryable: false }
        return
      }

      try {
        for await (const value of readNdjson(response.body)) {
          const parsed = stepEventSchema.safeParse(value)
          if (!parsed.success) {
            yield { type: 'error', error: internalError(), retryable: false }
            return
          }
          yield parsed.data
        }
      } catch (error) {
        if (isAbort(error, signal)) {
          throw error
        }
        if (error instanceof Error && error.message === 'NDJSON 解析失败') {
          yield { type: 'error', error: internalError(), retryable: false }
          return
        }
        yield {
          type: 'error',
          error: { code: 'upstream_error', message: '网络连接失败' },
          retryable: true,
        }
      }
    },
    now: () => performance.now(),
    sleep(ms, signal) {
      return new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException('aborted', 'AbortError'))
          return
        }
        const onAbort = () => {
          clearTimeout(timer)
          reject(new DOMException('aborted', 'AbortError'))
        }
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort)
          resolve()
        }, ms)
        signal.addEventListener('abort', onAbort, { once: true })
      })
    },
    newRunId: () => crypto.randomUUID(),
  }
}

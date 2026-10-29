import 'server-only'

import {
  stepEventSchema,
  type AgentBatchLine,
  type AgentStepRequest,
  type StepEvent,
} from '@/lib/contracts/api'
import { AsyncQueue } from '@/lib/stream/queue'
import { toApiError } from '@/server/llm/errors'
import type { LlmClient } from '@/server/llm/types'
import { runAgentStep } from './step'

const ROUTE = '/api/agent/batch'

function isTerminal(event: StepEvent): boolean {
  return event.type === 'done' || event.type === 'error'
}

/**
 * 同时执行一批步骤，把各自的事件按到达顺序合并成一条流，每条带上步骤下标。
 * 每个步骤最终都以 done 或 error 收尾；消费方提前结束或请求中断时，所有仍在运行的步骤一起停止。
 */
export async function* runAgentBatch(
  llm: LlmClient,
  requests: AgentStepRequest[],
  signal: AbortSignal,
): AsyncGenerator<AgentBatchLine> {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (signal.aborted) {
    controller.abort()
  }
  signal.addEventListener('abort', onAbort, { once: true })

  const queue = new AsyncQueue<AgentBatchLine>()
  let remaining = requests.length

  requests.forEach((req, i) => {
    void (async () => {
      try {
        for await (const event of runAgentStep(llm, req, controller.signal)) {
          const parsed = stepEventSchema.safeParse(event)
          const line: AgentBatchLine = parsed.success
            ? { i, event: parsed.data }
            : {
                i,
                event: {
                  type: 'error',
                  error: { code: 'internal', message: '服务内部错误' },
                  retryable: false,
                },
              }
          queue.push(line)
          if (isTerminal(line.event)) {
            break
          }
        }
      } catch (error) {
        const mapped = toApiError(error, controller.signal, ROUTE)
        queue.push({
          i,
          event: { type: 'error', error: mapped.error, retryable: mapped.retryable },
        })
      } finally {
        remaining -= 1
        if (remaining === 0) {
          queue.close()
        }
      }
    })()
  })

  try {
    for await (const line of queue) {
      yield line
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    controller.abort()
  }
}

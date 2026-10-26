import { expect } from 'vitest'
import type {
  AgentStepRequest,
  AssessRequest,
  AssessResponse,
  PlanRequest,
  PlanResponse,
  StepEvent,
} from '@/lib/contracts/api'
import { runEventSchema, type RunEvent } from '@/lib/contracts/events'
import type { OrchestratorDeps } from '@/lib/orchestrator/run'
import { reduceEvents } from '@/lib/run/reducer'
import type { RunState } from '@/lib/run/types'

export type StepScript = Array<StepEvent | { wait: Promise<void> }>

export interface FakeDepsScript {
  assess?: AssessResponse | Error
  plan?: PlanResponse | Error
  steps?: Record<string, StepScript | StepScript[]>
}

export function expectConsistent(events: RunEvent[], state: RunState): void {
  let previousT = 0
  events.forEach((event, index) => {
    expect(runEventSchema.safeParse(event).success).toBe(true)
    expect(event.seq).toBe(index)
    expect(event.t).toBeGreaterThanOrEqual(previousT)
    previousT = event.t
  })
  expect(state).toEqual(reduceEvents(events))
}

function abortError(): DOMException {
  return new DOMException('aborted', 'AbortError')
}

async function waitWithAbort(wait: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw abortError()
  }
  let onAbort = () => {}
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    await Promise.race([wait, aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

function defaultAssessment(): AssessResponse {
  return {
    assessment: {
      dims: { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 },
      rationale: '测试评估',
      source: 'llm',
    },
  }
}

export function createFakeDeps(script: FakeDepsScript = {}): {
  deps: OrchestratorDeps
  calls: {
    assess: AssessRequest[]
    plan: PlanRequest[]
    step: Array<{ req: AgentStepRequest; attempt: number }>
    sleep: number[]
  }
  maxConcurrent: () => number
} {
  const calls = {
    assess: [] as AssessRequest[],
    plan: [] as PlanRequest[],
    step: [] as Array<{ req: AgentStepRequest; attempt: number }>,
    sleep: [] as number[],
  }
  let time = 0
  let active = 0
  let maxActive = 0

  function stepScript(nodeId: string, attempt: number): StepScript {
    const configured = script.steps?.[nodeId]
    if (configured === undefined) {
      return [
        {
          type: 'done',
          output: `${nodeId} 完成`,
          usage: { inputTokens: 1, outputTokens: 1 },
        },
      ]
    }
    if (configured.length === 0) {
      return []
    }
    const attempts = Array.isArray(configured[0])
      ? (configured as StepScript[])
      : [configured as StepScript]
    return attempts[attempt - 1] ?? attempts.at(-1) ?? []
  }

  const deps: OrchestratorDeps = {
    async assess(req) {
      calls.assess.push(structuredClone(req))
      const configured = script.assess ?? defaultAssessment()
      if (configured instanceof Error) {
        throw configured
      }
      return configured
    },
    async plan(req) {
      calls.plan.push(structuredClone(req))
      const configured = script.plan ?? { plan: null, source: 'fallback', attempts: [] }
      if (configured instanceof Error) {
        throw configured
      }
      return configured
    },
    async *step(req, signal) {
      const attempt = calls.step.filter((call) => call.req.node.id === req.node.id).length + 1
      calls.step.push({ req: structuredClone(req), attempt })
      active += 1
      maxActive = Math.max(maxActive, active)
      try {
        for (const item of stepScript(req.node.id, attempt)) {
          if ('wait' in item) {
            await waitWithAbort(item.wait, signal)
          }
          if (signal.aborted) {
            throw abortError()
          }
          if (!('wait' in item)) {
            yield item
          }
        }
      } finally {
        active -= 1
      }
    },
    now() {
      time += 10
      return time
    },
    sleep(ms, signal) {
      calls.sleep.push(ms)
      return signal.aborted ? Promise.reject(abortError()) : Promise.resolve()
    },
    newRunId: () => 'fake-run',
  }

  return { deps, calls, maxConcurrent: () => maxActive }
}

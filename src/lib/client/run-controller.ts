import type { RunRecord } from '@/lib/contracts/run-record'
import { createHttpDeps, type OrchestratorDeps } from '@/lib/orchestrator/http-deps'
import { runOrchestration, type RunInput } from '@/lib/orchestrator/run'
import { saveRun as persistRun } from '@/lib/storage/runs'
import { useRunStore } from '@/stores/run-store'

export interface StartRunInput extends RunInput {
  confirmBeforeRun: boolean
}

export interface RunController {
  startRun: (input: StartRunInput) => Promise<void>
  cancelRun: () => void
  confirm: (accept: boolean) => void
}

interface RunControllerOptions {
  depsFactory?: () => OrchestratorDeps
  saveRun?: (record: RunRecord) => Promise<void>
}

export function createRunController({
  depsFactory = createHttpDeps,
  saveRun = persistRun,
}: RunControllerOptions = {}): RunController {
  let activeController: AbortController | undefined
  let resolveConfirmation: ((accept: boolean) => void) | undefined

  function confirm(accept: boolean): void {
    const resolve = resolveConfirmation
    if (resolve === undefined) return
    const store = useRunStore.getState()
    store.setPendingPlan(undefined)
    store.setPhase('running')
    resolve(accept)
  }

  function cancelRun(): void {
    activeController?.abort()
    resolveConfirmation?.(false)
  }

  async function startRun({
    assistant,
    task,
    intensity,
    confirmBeforeRun,
  }: StartRunInput): Promise<void> {
    if (activeController !== undefined) return
    const store = useRunStore.getState()
    store.reset()
    const controller = new AbortController()
    activeController = controller
    const createdAt = new Date().toISOString()
    store.setPhase('running')

    try {
      const deps = depsFactory()
      if (confirmBeforeRun) {
        deps.confirmPlan = (plan, _state, signal) => {
          const current = useRunStore.getState()
          current.setPendingPlan(plan)
          current.setPhase('awaiting_confirm')
          return new Promise<boolean>((resolve) => {
            let settled = false
            const finish = (accept: boolean) => {
              if (settled) return
              settled = true
              signal.removeEventListener('abort', onAbort)
              if (resolveConfirmation === finish) resolveConfirmation = undefined
              resolve(accept)
            }
            const onAbort = () => finish(false)
            resolveConfirmation = finish
            if (signal.aborted) {
              finish(false)
            } else {
              signal.addEventListener('abort', onAbort, { once: true })
            }
          })
        }
      }

      const finalState = await runOrchestration(
        { assistant, task, intensity },
        deps,
        (event) => useRunStore.getState().push(event),
        controller.signal,
      )
      const current = useRunStore.getState()
      current.setPhase('done')
      current.setPendingPlan(undefined)
      if (finalState.runId !== null && finalState.assistantId !== null) {
        const record: RunRecord = {
          runId: finalState.runId,
          assistantId: finalState.assistantId,
          task: finalState.task,
          createdAt,
          status: finalState.status,
          level: finalState.level,
          usage: finalState.usage,
          durationMs: finalState.durationMs ?? finalState.lastT,
          events: current.events,
        }
        try {
          await saveRun(record)
        } catch {
          console.warn('[storage] 保存运行记录失败')
        }
      }
    } catch {
      const current = useRunStore.getState()
      current.setPhase('done')
      current.setPendingPlan(undefined)
      useRunStore.setState({ error: '运行未能启动，请稍后重试' })
    } finally {
      if (activeController === controller) {
        activeController = undefined
        resolveConfirmation = undefined
      }
    }
  }

  return { startRun, cancelRun, confirm }
}

const controller = createRunController()

export const startRun = controller.startRun
export const cancelRun = controller.cancelRun
export const confirm = controller.confirm

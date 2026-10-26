import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runRecordSchema, type RunRecord } from '@/lib/contracts/run-record'
import { validPlans } from '@/lib/fixtures/plans'
import { createFakeDeps, type FakeDepsScript } from '@/test/fake-deps'
import { testAssistant } from '@/test/fixtures'
import { useRunStore } from '@/stores/run-store'
import { createRunController, type RunController, type StartRunInput } from './run-controller'

let controller: RunController | undefined
let running: Promise<void> | undefined

const input: StartRunInput = {
  assistant: testAssistant,
  task: '复杂任务',
  intensity: 0.5,
  confirmBeforeRun: false,
}

function plannerScript(wait?: Promise<void>): FakeDepsScript {
  const plan = structuredClone(validPlans[3])
  for (const node of plan.nodes) node.tools = []
  return {
    assess: {
      assessment: {
        dims: { subtasks: 2, tools: 1, parallel: 2, rigor: 1, length: 1 },
        rationale: '需要多 Agent 协作',
        source: 'llm',
      },
    },
    plan: { plan, source: 'planner', attempts: [] },
    ...(wait === undefined
      ? {}
      : {
          steps: {
            research_a: [{ wait }],
            research_b: [{ wait }],
          },
        }),
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {}
  const promise = new Promise<void>((resolver) => {
    resolve = () => resolver()
  })
  return { promise, resolve }
}

async function until(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 60 && !predicate(); index += 1) {
    await Promise.resolve()
  }
  expect(predicate()).toBe(true)
}

function makeController(deps: ReturnType<typeof createFakeDeps>['deps'], records: RunRecord[]) {
  controller = createRunController({
    depsFactory: () => deps,
    saveRun: async (record) => {
      records.push(record)
    },
  })
  return controller
}

beforeEach(() => {
  useRunStore.getState().reset()
  controller = undefined
  running = undefined
})

afterEach(async () => {
  controller?.cancelRun()
  await running
  useRunStore.getState().reset()
  vi.restoreAllMocks()
})

describe('run controller', () => {
  it('正常完成后保存通过 schema 的运行记录', async () => {
    const { deps } = createFakeDeps()
    const records: RunRecord[] = []
    const current = makeController(deps, records)

    running = current.startRun({ ...input, task: '你好' })
    await running

    const store = useRunStore.getState()
    expect(store.phase).toBe('done')
    expect(store.state.status).toBe('completed')
    expect(records).toHaveLength(1)
    expect(runRecordSchema.safeParse(records[0]).success).toBe(true)
    expect(records[0]).toMatchObject({
      assistantId: testAssistant.id,
      task: '你好',
      status: 'completed',
      level: 0,
      events: store.events,
    })
  })

  it('运行中途取消后仍保存 cancelled 记录', async () => {
    const gate = deferred()
    const { deps, calls } = createFakeDeps(plannerScript(gate.promise))
    const records: RunRecord[] = []
    const current = makeController(deps, records)

    running = current.startRun(input)
    await until(() => calls.step.length > 0)
    current.cancelRun()
    await running
    gate.resolve()

    expect(useRunStore.getState().state.status).toBe('cancelled')
    expect(records).toHaveLength(1)
    expect(records[0]?.status).toBe('cancelled')
    expect(runRecordSchema.safeParse(records[0]).success).toBe(true)
  })

  it('确认阶段进入 awaiting_confirm，接受后继续执行', async () => {
    const { deps, calls } = createFakeDeps(plannerScript())
    const records: RunRecord[] = []
    const current = makeController(deps, records)

    running = current.startRun({ ...input, confirmBeforeRun: true })
    await until(() => useRunStore.getState().phase === 'awaiting_confirm')
    expect(useRunStore.getState().pendingPlan?.level).toBe(3)
    expect(calls.step).toHaveLength(0)

    current.confirm(true)
    await running

    expect(useRunStore.getState().state.status).toBe('completed')
    expect(useRunStore.getState().pendingPlan).toBeUndefined()
    expect(records).toHaveLength(1)
  })

  it('拒绝确认后保存 cancelled，不执行节点', async () => {
    const { deps, calls } = createFakeDeps(plannerScript())
    const records: RunRecord[] = []
    const current = makeController(deps, records)

    running = current.startRun({ ...input, confirmBeforeRun: true })
    await until(() => useRunStore.getState().phase === 'awaiting_confirm')
    current.confirm(false)
    await running

    expect(useRunStore.getState().state.status).toBe('cancelled')
    expect(calls.step).toHaveLength(0)
    expect(records[0]?.status).toBe('cancelled')
  })

  it('活动运行期间重复 start 会被忽略', async () => {
    const gate = deferred()
    const { deps, calls } = createFakeDeps(plannerScript(gate.promise))
    const records: RunRecord[] = []
    const current = makeController(deps, records)

    running = current.startRun(input)
    await until(() => calls.step.length > 0)
    await current.startRun({ ...input, task: '另一个任务' })

    expect(useRunStore.getState().state.task).toBe(input.task)
    expect(
      useRunStore.getState().events.filter((event) => event.type === 'run.started'),
    ).toHaveLength(1)
    gate.resolve()
    await running
    expect(records).toHaveLength(1)
  })

  it('保存失败只警告，不影响最终 phase', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { deps } = createFakeDeps()
    controller = createRunController({
      depsFactory: () => deps,
      saveRun: async () => {
        throw new Error('quota exceeded')
      },
    })

    running = controller.startRun({ ...input, task: '你好' })
    await expect(running).resolves.toBeUndefined()

    expect(useRunStore.getState().phase).toBe('done')
    expect(useRunStore.getState().state.status).toBe('completed')
    expect(warn).toHaveBeenCalledWith('[storage] 保存运行记录失败')
  })
})

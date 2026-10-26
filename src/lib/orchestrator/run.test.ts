import { describe, expect, it } from 'vitest'
import type { StepEvent } from '../contracts/api'
import type { ApiError, Level } from '../contracts/common'
import type { RunEvent } from '../contracts/events'
import type { ComplexityAssessment, Plan, PlanNode } from '../contracts/plan'
import { validPlans } from '../fixtures/plans'
import { testAssistant } from '@/test/fixtures'
import { createFakeDeps, expectConsistent, type FakeDepsScript } from '@/test/fake-deps'
import { LEVELS } from './level'
import { runOrchestration, type OrchestratorDeps, type RunInput } from './run'
import { validatePlan } from './validate-plan'

const baseInput: RunInput = { assistant: testAssistant, task: '测试任务', intensity: 0.5 }

function assessmentFor(level: Level): { assessment: ComplexityAssessment } {
  const dims: Record<Level, ComplexityAssessment['dims']> = {
    0: { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 },
    1: { subtasks: 1, tools: 1, parallel: 0, rigor: 0, length: 0 },
    2: { subtasks: 2, tools: 0, parallel: 0, rigor: 1, length: 1 },
    3: { subtasks: 2, tools: 1, parallel: 2, rigor: 1, length: 1 },
    4: { subtasks: 2, tools: 2, parallel: 2, rigor: 2, length: 2 },
  }
  return { assessment: { dims: dims[level], rationale: '测试评估', source: 'llm' } }
}

function planFor(level: Level): Plan {
  const plan = structuredClone(validPlans[level])
  for (const node of plan.nodes) {
    node.tools = []
  }
  return plan
}

function planResponse(
  level: Level,
  attempts: Array<{ errors: string[] }> = [],
): { plan: Plan; source: 'planner'; attempts: Array<{ errors: string[] }> } {
  return { plan: planFor(level), source: 'planner', attempts }
}

function nodeAt(plan: Plan, index: number): PlanNode {
  const node = plan.nodes[index]
  if (node === undefined) {
    throw new Error(`计划缺少节点 ${index}`)
  }
  return node
}

function done(output: string, usage = { inputTokens: 1, outputTokens: 1 }): StepEvent {
  return { type: 'done', output, usage }
}

function errorEvent(
  retryable = false,
  message = '执行失败',
  code: ApiError['code'] = 'upstream_error',
): StepEvent {
  return { type: 'error', error: { code, message }, retryable }
}

function review(verdict: 'pass' | 'revise', issues: string[] = []): StepEvent {
  return { type: 'review', verdict, issues }
}

async function execute(
  deps: OrchestratorDeps,
  input: RunInput = baseInput,
  signal = new AbortController().signal,
) {
  const events: RunEvent[] = []
  const state = await runOrchestration(input, deps, (event) => events.push(event), signal)
  expectConsistent(events, state)
  return { events, state }
}

async function flushCalls(calls: unknown[], count: number): Promise<void> {
  for (let index = 0; index < 30 && calls.length < count; index += 1) {
    await Promise.resolve()
  }
  expect(calls.length).toBeGreaterThanOrEqual(count)
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {}
  const promise = new Promise<void>((resolver) => {
    resolve = () => resolver()
  })
  return { promise, resolve }
}

describe('评估与规划', () => {
  it('01 规则寒暄走 L0 静态计划，不调用 assess', async () => {
    const { deps, calls } = createFakeDeps()
    const { state } = await execute(deps, { ...baseInput, task: '你好' })

    expect(calls.assess).toHaveLength(0)
    expect(calls.plan).toHaveLength(0)
    expect(state).toMatchObject({ level: 0, planSource: 'static', status: 'completed' })
    expect(state.nodeOrder).toEqual(['answer'])
  })

  it('02 assess 抛错时使用共享兜底评估', async () => {
    const { deps } = createFakeDeps({ assess: new Error('评估不可用') })
    const { events, state } = await execute(deps)
    const completed = events.find((event) => event.type === 'assess.completed')

    expect(completed).toMatchObject({ assessment: { source: 'fallback' } })
    expect(state.assessment).toMatchObject({ source: 'fallback' })
    expect(state.status).toBe('completed')
  })

  it('危机规则在本地拦截，不发 assess 请求且不进入规划', async () => {
    const { deps, calls } = createFakeDeps()
    const { events, state } = await execute(deps, { ...baseInput, task: '我不想活了' })

    expect(calls.assess).toHaveLength(0)
    expect(calls.plan).toHaveLength(0)
    expect(calls.step).toHaveLength(0)
    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'assess.started',
      'assess.completed',
      'run.completed',
    ])
    expect(state.assessment).toMatchObject({
      source: 'rule',
      guard: { blocked: true, kind: 'crisis' },
    })
    expect(state.plan).toBeUndefined()
    expect(state.output).toContain('12356')
    expect(state.warnings).toEqual(['已按安全护栏拒绝执行'])
    expect(state.degraded).toBe(false)
  })

  it('服务端返回 policy 护栏时直接交付拒答，不执行计划', async () => {
    const response = assessmentFor(4)
    response.assessment.guard = {
      blocked: true,
      kind: 'policy',
      reason: '涉及违规或危险内容',
    }
    const { deps, calls } = createFakeDeps({ assess: response })
    const { events, state } = await execute(deps)

    expect(calls.assess).toHaveLength(1)
    expect(calls.plan).toHaveLength(0)
    expect(calls.step).toHaveLength(0)
    expect(events.some((event) => event.type === 'plan.started')).toBe(false)
    expect(state.plan).toBeUndefined()
    expect(state.output).toContain('涉及违规或危险内容')
    expect(state.warnings).toEqual(['已按安全护栏拒绝执行'])
  })

  it('03 L1 静态计划只使用 usableTools', async () => {
    const { deps, calls } = createFakeDeps({ assess: assessmentFor(1) })
    const { state } = await execute(deps)

    expect(calls.plan).toHaveLength(0)
    expect(state.plan?.nodes[0]?.tools).toEqual(['datetime'])
    expect(state.planSource).toBe('static')
  })

  it('04 L3 planner 成功且 attempts 为空', async () => {
    const { deps, calls } = createFakeDeps({
      assess: assessmentFor(3),
      plan: planResponse(3),
    })
    const { state } = await execute(deps)

    expect(calls.plan).toHaveLength(1)
    expect(state).toMatchObject({ level: 3, planSource: 'planner', planFailures: [] })
  })

  it('05 planner 的一次失败尝试逐条发出', async () => {
    const { deps } = createFakeDeps({
      assess: assessmentFor(3),
      plan: planResponse(3, [{ errors: ['首次计划存在环'] }]),
    })
    const { events, state } = await execute(deps)
    const failures = events.filter((event) => event.type === 'plan.attempt_failed')

    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({ attempt: 1, errors: ['首次计划存在环'] })
    expect(state.planSource).toBe('planner')
  })

  it('06 plan 为 null 时退回静态计划并记录 warning', async () => {
    const { deps } = createFakeDeps({
      assess: assessmentFor(3),
      plan: { plan: null, source: 'fallback', attempts: [] },
    })
    const { state } = await execute(deps)

    expect(state.planSource).toBe('fallback')
    expect(state.plan?.level).toBe(1)
    expect(state.warnings).toContain('编排规划失败，已退回单 Agent 执行')
  })

  it('07 客户端发现非法计划时追加 attempt_failed 并 fallback', async () => {
    const invalid = { ...planFor(3), outputNodeId: 'missing' }
    const { deps } = createFakeDeps({
      assess: assessmentFor(3),
      plan: { plan: invalid, source: 'planner', attempts: [] },
    })
    const { events, state } = await execute(deps)

    expect(events.filter((event) => event.type === 'plan.attempt_failed')).toHaveLength(1)
    expect(state.planSource).toBe('fallback')
    expect(state.warnings).toContain('编排规划失败，已退回单 Agent 执行')
  })

  it('08 plan 调用抛错时按 fallback 处理', async () => {
    const { deps } = createFakeDeps({ assess: assessmentFor(3), plan: new Error('规划超时') })
    const { state } = await execute(deps)

    expect(state.planSource).toBe('fallback')
    expect(state.status).toBe('completed')
    expect(state.warnings).toContain('编排规划失败，已退回单 Agent 执行')
  })

  it('09 plan.completed 写入对应级别预算', async () => {
    const { deps } = createFakeDeps({ assess: assessmentFor(3), plan: planResponse(3) })
    const { events } = await execute(deps)
    const completed = events.find((event) => event.type === 'plan.completed')

    expect(completed).toMatchObject({ budget: LEVELS[3].budget })
  })
})

describe('执行前确认', () => {
  it('确认通过后才执行节点', async () => {
    const { deps, calls } = createFakeDeps({
      assess: assessmentFor(3),
      plan: planResponse(3),
    })
    let confirmations = 0
    deps.confirmPlan = async (plan, state) => {
      confirmations += 1
      expect(plan.nodes.length).toBeGreaterThan(1)
      expect(state.status).toBe('running')
      expect(state.planSource).toBe('planner')
      expect(Object.values(state.nodes).every((node) => node.status === 'pending')).toBe(true)
      expect(calls.step).toHaveLength(0)
      return true
    }

    const { state } = await execute(deps)

    expect(confirmations).toBe(1)
    expect(state.status).toBe('completed')
    expect(calls.step.length).toBeGreaterThan(0)
  })

  it('拒绝确认时取消运行，所有节点标记已取消且不执行', async () => {
    const { deps, calls } = createFakeDeps({
      assess: assessmentFor(3),
      plan: planResponse(3),
    })
    deps.confirmPlan = async () => false

    const { events, state } = await execute(deps)

    expect(state.status).toBe('cancelled')
    expect(calls.step).toHaveLength(0)
    expect(events.filter((event) => event.type === 'run.cancelled')).toHaveLength(1)
    expect(
      Object.values(state.nodes).every(
        (node) => node.status === 'skipped' && node.skipReason === '已取消',
      ),
    ).toBe(true)
  })

  it('确认抛出 AbortError 时按取消处理', async () => {
    const { deps, calls } = createFakeDeps({
      assess: assessmentFor(3),
      plan: planResponse(3),
    })
    deps.confirmPlan = async () => {
      throw new DOMException('aborted', 'AbortError')
    }

    const { state } = await execute(deps)

    expect(state.status).toBe('cancelled')
    expect(calls.step).toHaveLength(0)
    expect(Object.values(state.nodes).every((node) => node.status === 'skipped')).toBe(true)
  })

  it('不提供 confirmPlan 时保持原有执行行为', async () => {
    const { deps, calls } = createFakeDeps({
      assess: assessmentFor(3),
      plan: planResponse(3),
    })

    const { state } = await execute(deps)

    expect(state.status).toBe('completed')
    expect(calls.step.length).toBeGreaterThan(0)
  })

  it('static 和 fallback 计划不请求确认', async () => {
    const scripts: FakeDepsScript[] = [
      { assess: assessmentFor(1) },
      {
        assess: assessmentFor(3),
        plan: { plan: null, source: 'fallback', attempts: [] },
      },
    ]
    for (const script of scripts) {
      const { deps } = createFakeDeps(script)
      let confirmations = 0
      deps.confirmPlan = async () => {
        confirmations += 1
        return false
      }

      const { state } = await execute(deps)

      expect(confirmations).toBe(0)
      expect(state.status).toBe('completed')
    }
  })
})

describe('调度', () => {
  it('10 L3 两个 researcher 并发，analyst 等待两者完成', async () => {
    const gateA = deferred()
    const gateB = deferred()
    const { deps, calls } = createFakeDeps({
      assess: assessmentFor(3),
      plan: planResponse(3),
      steps: {
        research_a: [{ wait: gateA.promise }, done('A')],
        research_b: [{ wait: gateB.promise }, done('B')],
      },
    })
    const running = execute(deps)
    await flushCalls(calls.step, 2)

    const earlyEvents = calls.step.map((call) => call.req.node.id)
    expect(earlyEvents).toEqual(['research_a', 'research_b'])
    expect(calls.step.some((call) => call.req.node.id === 'analyst')).toBe(false)
    gateA.resolve()
    gateB.resolve()
    const { events } = await running

    const analystStart = events.findIndex(
      (event) => event.type === 'node.started' && event.nodeId === 'analyst',
    )
    const firstCompleted = events.findIndex((event) => event.type === 'node.completed')
    for (const id of ['research_a', 'research_b']) {
      const started = events.findIndex(
        (event) => event.type === 'node.started' && event.nodeId === id,
      )
      const completed = events.findIndex(
        (event) => event.type === 'node.completed' && event.nodeId === id,
      )
      expect(started).toBeGreaterThanOrEqual(0)
      expect(started).toBeLessThan(firstCompleted)
      expect(completed).toBeGreaterThanOrEqual(0)
      expect(analystStart).toBeGreaterThan(completed)
    }
  })

  it('11 四个同时就绪的节点也最多并发 3 个', async () => {
    const plan = planFor(3)
    const roots = [
      nodeAt(plan, 0),
      nodeAt(plan, 1),
      { ...nodeAt(plan, 0), id: 'research_c', title: '补充调研 C' },
      { ...nodeAt(plan, 0), id: 'research_d', title: '补充调研 D' },
    ]
    const parallelPlan: Plan = {
      ...plan,
      nodes: [
        ...roots,
        { ...nodeAt(plan, 2), dependsOn: roots.map((node) => node.id) },
        nodeAt(plan, 3),
      ],
    }
    expect(validatePlan(parallelPlan, { level: 3, allowedTools: [] })).toEqual([])
    const gate = deferred()
    const steps: FakeDepsScript['steps'] = Object.fromEntries(
      roots.map((node) => [node.id, [{ wait: gate.promise }, done(node.id)]]),
    )
    const { deps, calls, maxConcurrent } = createFakeDeps({
      assess: assessmentFor(3),
      plan: { plan: parallelPlan, source: 'planner', attempts: [] },
      steps,
    })
    const running = execute(deps)
    await flushCalls(calls.step, 3)
    expect(maxConcurrent()).toBe(3)
    gate.resolve()
    await running
    expect(maxConcurrent()).toBeLessThanOrEqual(3)
  })

  it('12 文本按 50ms 合并，并在 tool_call 前 flush', async () => {
    const deltas = 'abcdefghij'.split('').map((delta): StepEvent => ({ type: 'text', delta }))
    const { deps } = createFakeDeps({
      steps: {
        answer: [
          ...deltas,
          { type: 'tool_call', callId: 'c1', tool: 'datetime', input: {} },
          { type: 'tool_result', callId: 'c1', ok: true, summary: '当前时间' },
          done('abcdefghij'),
        ],
      },
    })
    let clock = 0
    deps.now = () => {
      clock += 5
      return clock
    }
    const { events } = await execute(deps)
    const textEvents = events.filter((event) => event.type === 'node.text')

    expect(textEvents.length).toBeLessThan(10)
    expect(textEvents.map((event) => event.delta).join('')).toBe('abcdefghij')
    expect(events.findIndex((event) => event.type === 'node.tool_call')).toBeGreaterThan(
      events.findLastIndex((event) => event.type === 'node.text'),
    )
  })

  it('13 upstream 汇总材料、截断 6000 字，isFinal 只给最终节点', async () => {
    const { deps, calls } = createFakeDeps({
      assess: assessmentFor(3),
      plan: planResponse(3),
      steps: {
        research_a: [done('a'.repeat(7000))],
        research_b: [done('B')],
      },
    })
    const { state } = await execute(deps)
    const analyst = calls.step.find((call) => call.req.node.id === 'analyst')

    expect(analyst?.req.upstream).toHaveLength(2)
    expect(analyst?.req.upstream[0]?.output).toHaveLength(6000)
    expect(analyst?.req.upstream[1]?.output).toBe('B')
    expect(analyst?.req.isFinal).toBe(false)
    expect(calls.step.filter((call) => call.req.isFinal).map((call) => call.req.node.id)).toEqual([
      'writer',
    ])
    expect(state.status).toBe('completed')
  })
})

describe('失败与重试', () => {
  it('14 retryable 错误等待 1000ms 后以 attempt 2 成功', async () => {
    const { deps, calls } = createFakeDeps({
      steps: { answer: [[errorEvent(true)], [done('重试成功')]] },
    })
    const { events, state } = await execute(deps)
    const starts = events.filter((event) => event.type === 'node.started')

    expect(starts.map((event) => event.attempt)).toEqual([1, 2])
    expect(calls.sleep).toEqual([1000])
    expect(events.some((event) => event.type === 'node.failed')).toBe(false)
    expect(state.output).toBe('重试成功')
  })

  it('15 不可重试错误直接 node.failed，不重试', async () => {
    const { deps, calls } = createFakeDeps({ steps: { answer: [errorEvent(false)] } })
    const { events } = await execute(deps)

    expect(events.filter((event) => event.type === 'node.failed')).toHaveLength(1)
    expect(calls.step.filter((call) => call.req.node.id === 'answer')).toHaveLength(1)
    expect(calls.sleep).toEqual([])
  })

  it('16 两次 retryable 失败后 node.failed', async () => {
    const { deps, calls } = createFakeDeps({
      steps: { answer: [[errorEvent(true)], [errorEvent(true)]] },
    })
    const { events, state } = await execute(deps)
    const starts = events.filter((event) => event.type === 'node.started')

    expect(starts.map((event) => event.attempt)).toEqual([1, 2])
    expect(events.filter((event) => event.type === 'node.failed')).toHaveLength(1)
    expect(calls.sleep).toEqual([1000])
    expect(state).toMatchObject({
      status: 'failed',
      error: { code: 'upstream_error', message: '执行失败' },
    })
    expect(events.at(-1)).toMatchObject({ type: 'run.failed', error: { message: '执行失败' } })
    expect(calls.step.some((call) => call.req.node.id === 'fallback_answer')).toBe(false)
  })

  it('17 流没有 done 或 error 时按连接中断重试', async () => {
    const { deps, calls } = createFakeDeps({
      steps: { answer: [[{ type: 'text', delta: '中断' }], [done('恢复')]] },
    })
    const { events, state } = await execute(deps)

    expect(calls.sleep).toEqual([1000])
    expect(events.some((event) => event.type === 'node.failed')).toBe(false)
    expect(state.output).toBe('恢复')
  })

  it('18 失败级联跨两层跳过，并以 fallback_answer 降级完成', async () => {
    const { deps, calls } = createFakeDeps({
      assess: assessmentFor(3),
      plan: planResponse(3),
      steps: {
        research_a: [errorEvent(false)],
        research_b: [done('材料 B')],
      },
    })
    const { events, state } = await execute(deps)

    for (const id of ['analyst', 'writer']) {
      expect(state.nodes[id]).toMatchObject({ status: 'skipped', skipReason: '上游环节未完成' })
    }
    const added = events.find(
      (event) => event.type === 'node.added' && event.node.id === 'fallback_answer',
    )
    expect(added).toMatchObject({ reason: 'fallback', node: { dependsOn: ['research_b'] } })
    const fallback = calls.step.find((call) => call.req.node.id === 'fallback_answer')
    expect(fallback?.req.upstream.map((item) => item.nodeId)).toEqual(['research_b'])
    expect(state).toMatchObject({ status: 'completed', degraded: true })
    expect(state.warnings).toContain('部分环节失败，已由单个 Agent 基于现有材料作答')
  })

  it('19 降级节点也失败时发出 run.failed', async () => {
    const { deps } = createFakeDeps({
      assess: assessmentFor(3),
      plan: planResponse(3),
      steps: {
        research_a: [errorEvent(false)],
        fallback_answer: [errorEvent(false, '降级失败')],
      },
    })
    const { events, state } = await execute(deps)

    expect(state.status).toBe('failed')
    expect(events.at(-1)).toMatchObject({ type: 'run.failed', error: { message: '降级失败' } })
  })
})

describe('预算', () => {
  it('20 超预算只发一次事件，pending 跳过并输出阶段成果', async () => {
    const { deps, calls } = createFakeDeps({
      assess: assessmentFor(2),
      plan: planResponse(2),
      steps: {
        research: [done('阶段成果', { inputTokens: 20_000, outputTokens: 10_001 })],
      },
    })
    const { events, state } = await execute(deps)

    expect(events.filter((event) => event.type === 'budget.exceeded')).toHaveLength(1)
    for (const id of ['write', 'polish']) {
      expect(state.nodes[id]).toMatchObject({ status: 'skipped', skipReason: '预算已用尽' })
      expect(calls.step.some((call) => call.req.node.id === id)).toBe(false)
    }
    expect(state).toMatchObject({ status: 'completed', output: '阶段成果', degraded: true })
    expect(state.warnings).toContain('预算已用尽，以下为已完成环节的阶段性成果')
  })

  it('21 最终节点完成后才超预算，仍正常完成且不降级', async () => {
    const { deps } = createFakeDeps({
      steps: { answer: [done('超预算答案', { inputTokens: 3000, outputTokens: 2000 })] },
    })
    const { events, state } = await execute(deps)

    expect(events.filter((event) => event.type === 'budget.exceeded')).toHaveLength(1)
    expect(state).toMatchObject({
      status: 'completed',
      output: '超预算答案',
      degraded: false,
    })
    expect(state.nodeOrder).not.toContain('fallback_answer')
  })
})

describe('审校回路', () => {
  it('22 L4 一轮返工递归取原材料，复核通过后交付修订稿', async () => {
    const { deps, calls } = createFakeDeps({
      assess: assessmentFor(4),
      plan: planResponse(4),
      steps: {
        writer: [done('初稿')],
        reviewer: [review('revise', ['补充数据', '完善建议']), done('审校完成')],
        writer_r1: [done('修订稿')],
        reviewer_r1: [review('pass'), done('复核完成')],
      },
    })
    const { events, state } = await execute(deps)
    const revision = calls.step.find((call) => call.req.node.id === 'writer_r1')
    const secondReview = calls.step.find((call) => call.req.node.id === 'reviewer_r1')

    expect(events.filter((event) => event.type === 'node.added')).toHaveLength(2)
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'node.added',
        node: expect.objectContaining({ id: 'writer_r1' }),
        revisionOf: 'writer',
      }),
    )
    expect(revision?.req.revision).toEqual({
      round: 1,
      feedback: '1. 补充数据\n2. 完善建议',
      previousOutput: '初稿',
    })
    expect(revision?.req.upstream.map((item) => item.nodeId)).toEqual(['analyst'])
    expect(revision?.req.upstream[0]?.output).toBe('analyst 完成')
    expect(secondReview?.req.upstream).toEqual([
      {
        nodeId: 'writer_r1',
        title: '修订·报告写作',
        role: 'writer',
        output: '修订稿',
      },
    ])
    expect(secondReview?.req.revision?.round).toBe(1)
    expect(state.nodeOrder).toHaveLength(7)
    expect(state).toMatchObject({ status: 'completed', output: '修订稿', degraded: false })
  })

  it('返工材料先去掉末尾免责声明，避免最终产出重复追加', async () => {
    const disclaimer = '内容仅供健康参考。'
    const assistant = {
      ...testAssistant,
      guardrails: { ...testAssistant.guardrails, disclaimer },
    }
    const { deps, calls } = createFakeDeps({
      assess: assessmentFor(4),
      plan: planResponse(4),
      steps: {
        writer: [done(`初稿\n\n> ⚠️ ${disclaimer}`)],
        reviewer: [review('revise', ['补充数据']), done('审校完成')],
        writer_r1: [done('修订稿')],
        reviewer_r1: [review('pass'), done('复核完成')],
      },
    })
    await execute(deps, { ...baseInput, assistant })
    const revision = calls.step.find((call) => call.req.node.id === 'writer_r1')

    expect(revision?.req.revision?.previousOutput).toBe('初稿')
    expect(revision?.req.revision?.previousOutput).not.toContain('> ⚠️')
  })

  it('23 连续三次 revise 只返工两轮并保留未解决意见警告', async () => {
    const { deps } = createFakeDeps({
      assess: assessmentFor(4),
      plan: planResponse(4),
      steps: {
        writer: [done('初稿')],
        reviewer: [review('revise', ['首轮意见']), done('首轮审校')],
        writer_r1: [done('第一版修订')],
        reviewer_r1: [review('revise', ['第二轮意见']), done('第二轮审校')],
        writer_r2: [done('第二版修订')],
        reviewer_r2: [review('revise', ['仍未解决']), done('第三轮审校')],
      },
    })
    const { state } = await execute(deps)

    expect(state.nodeOrder).toEqual([
      'research_a',
      'research_b',
      'analyst',
      'writer',
      'reviewer',
      'writer_r1',
      'reviewer_r1',
      'writer_r2',
      'reviewer_r2',
    ])
    expect(state.nodeOrder.some((id) => id.endsWith('_r3'))).toBe(false)
    expect(state).toMatchObject({ status: 'completed', output: '第二版修订', degraded: false })
    expect(state.warnings).toContain('审校仍有未解决的意见，已采用最后一版产出')
  })

  it('24 revise 时预算已超则不追加返工节点', async () => {
    const { deps } = createFakeDeps({
      assess: assessmentFor(4),
      plan: planResponse(4),
      steps: {
        writer: [done('初稿')],
        reviewer: [
          review('revise', ['需要修订']),
          done('审校完成', { inputTokens: 90_000, outputTokens: 10_000 }),
        ],
      },
    })
    const { state } = await execute(deps)

    expect(state.nodeOrder).toHaveLength(5)
    expect(state.nodes.writer_r1).toBeUndefined()
    expect(state).toMatchObject({ status: 'completed', output: '初稿', degraded: false })
    expect(state.warnings).toContain('预算不足，未进行返工')
  })

  it('25 审校不可重试失败仍交付产出并警告未经复核', async () => {
    const { deps } = createFakeDeps({
      assess: assessmentFor(4),
      plan: planResponse(4),
      steps: {
        writer: [done('待审初稿')],
        reviewer: [errorEvent(false, '审校不可用')],
      },
    })
    const { state } = await execute(deps)

    expect(state.nodes.reviewer).toMatchObject({ status: 'failed' })
    expect(state).toMatchObject({ status: 'completed', output: '待审初稿', degraded: false })
    expect(state.warnings).toContain('审校未完成，产出未经复核')
  })
})

describe('取消与异常防御', () => {
  it('27 节点等待期间取消只发一次终态，迟到的 settle 不再发事件', async () => {
    const gate = deferred()
    const controller = new AbortController()
    const { deps, calls } = createFakeDeps({
      assess: assessmentFor(3),
      plan: planResponse(3),
      steps: {
        research_a: [{ wait: gate.promise }, done('A')],
        research_b: [{ wait: gate.promise }, done('B')],
      },
    })
    const running = execute(deps, baseInput, controller.signal)
    await flushCalls(calls.step, 2)
    controller.abort()
    const { events, state } = await running
    const count = events.length
    gate.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(state.status).toBe('cancelled')
    expect(events.filter((event) => event.type === 'run.cancelled')).toHaveLength(1)
    expect(events.at(-1)?.type).toBe('run.cancelled')
    expect(events).toHaveLength(count)
  })

  it('28 assess 期间中止不会发出 assess.completed', async () => {
    const started = deferred()
    const release = deferred()
    const controller = new AbortController()
    const { deps } = createFakeDeps()
    deps.assess = async () => {
      started.resolve()
      await release.promise
      throw new DOMException('aborted', 'AbortError')
    }
    const running = execute(deps, baseInput, controller.signal)
    await started.promise
    controller.abort()
    release.resolve()
    const { events, state } = await running

    expect(state.status).toBe('cancelled')
    expect(events.filter((event) => event.type === 'run.cancelled')).toHaveLength(1)
    expect(events.some((event) => event.type === 'assess.completed')).toBe(false)
  })

  it('29 step 异常和 onEvent 异常都不会让编排器 reject', async () => {
    const failing = createFakeDeps()
    failing.deps.step = async function* () {
      throw new Error('连接异常')
    }
    const stepped = await execute(failing.deps)

    expect(failing.calls.sleep).toEqual([1000])
    expect(stepped.events).toContainEqual(
      expect.objectContaining({
        type: 'node.failed',
        error: { code: 'upstream_error', message: '网络连接失败' },
      }),
    )
    expect(stepped.state.status).toBe('failed')

    const { deps } = createFakeDeps()
    const events: RunEvent[] = []
    const state = await runOrchestration(
      baseInput,
      deps,
      (event) => {
        events.push(event)
        if (event.type === 'assess.completed') {
          throw new Error('界面回调异常')
        }
      },
      new AbortController().signal,
    )

    expectConsistent(events, state)
    expect(events.at(-1)).toMatchObject({ type: 'run.failed', error: { code: 'internal' } })
    expect(state.status).toBe('failed')
  })

  it('run.failed 立即中止在途节点的内部 signal', async () => {
    const { deps } = createFakeDeps()
    let requestSignal: AbortSignal | undefined
    deps.step = async function* (_req, stepSignal) {
      requestSignal = stepSignal
      yield { type: 'text', delta: '部分输出' }
      yield done('不会交付')
    }
    const events: RunEvent[] = []
    const state = await runOrchestration(
      baseInput,
      deps,
      (event) => {
        events.push(event)
        if (event.type === 'node.text') {
          throw new Error('界面回调异常')
        }
      },
      new AbortController().signal,
    )

    expectConsistent(events, state)
    expect(state.status).toBe('failed')
    expect(requestSignal?.aborted).toBe(true)
    expect(events.at(-1)?.type).toBe('run.failed')
    expect(events.some((event) => event.type === 'run.cancelled')).toBe(false)
  })
})

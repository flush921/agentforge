import { describe, expect, it } from 'vitest'
import { agentStepRequestSchema, type AssessResponse, type StepEvent } from '../contracts/api'
import type { RunEvent } from '../contracts/events'
import { planNodeSchema, type Lane, type Plan } from '../contracts/plan'
import type { JudgeResult } from '../contracts/ultra'
import { validPlans } from '../fixtures/plans'
import { reduceEvents } from '../run/reducer'
import { testAssistant } from '@/test/fixtures'
import { createFakeDeps, expectConsistent, type FakeDepsScript } from '@/test/fake-deps'
import { runOrchestration, type OrchestratorDeps, type RunInput } from './run'
import {
  expandUltraPlan,
  LANE_LABELS,
  LANES,
  laneCountFor,
  ULTRA_BUDGET,
  ULTRA_CONCURRENCY,
  ultraReport,
} from './ultra'
import { validatePlan } from './validate-plan'

const ultraInput: RunInput = {
  assistant: testAssistant,
  task: '调研大学生使用 AI 学习工具的现状，写一份分析报告',
  intensity: 0.5,
  ultra: true,
}

/** L4 夹具：research_a、research_b 是起点，analyst 汇合，writer 交付，reviewer 审校。 */
function l4Plan(): Plan {
  const plan = structuredClone(validPlans[4])
  for (const node of plan.nodes) {
    node.tools = []
  }
  return plan
}

const GROUPS = { research_a: 5, research_b: 5, analyst: 3, writer: 5 } as const
type Group = keyof typeof GROUPS

/** 让评估落在 L2，用来验证 Ultra 会把级别强制提到 L4。 */
const l2Assessment: AssessResponse = {
  assessment: {
    dims: { subtasks: 2, tools: 0, parallel: 0, rigor: 1, length: 1 },
    rationale: '测试评估',
    source: 'llm',
  },
}

function done(output: string): StepEvent {
  return { type: 'done', output, usage: { inputTokens: 1, outputTokens: 1 } }
}

const failed: StepEvent[] = [
  { type: 'error', error: { code: 'internal', message: '失败' }, retryable: false },
]

function laneOutput(group: string, lane: Lane): string {
  return `${group} ${LANE_LABELS[lane]}稿`
}

function picked(group: Group, winner: Lane = 'depth'): StepEvent[] {
  const result: JudgeResult = {
    winner,
    scores: LANES.slice(0, GROUPS[group]).map((lane) => ({
      lane,
      scores: lane === winner ? [9, 8.5, 9] : [7, 7, 7],
    })),
    reason: '洞察更深',
  }
  return [{ type: 'judge', result }, done(`采用「${LANE_LABELS[winner]}」一路`)]
}

function aligned(): StepEvent[] {
  return [
    { type: 'align', result: { score: 8, drift: [], summary: '方向一致', aligned: true } },
    done('校准沿用'),
  ]
}

/** 每个环节默认采用「深度」一路、校准一致、审校一次通过。 */
function ultraSteps(overrides: FakeDepsScript['steps'] = {}): FakeDepsScript['steps'] {
  const steps: NonNullable<FakeDepsScript['steps']> = {}
  for (const group of Object.keys(GROUPS) as Group[]) {
    LANES.slice(0, GROUPS[group]).forEach((lane, index) => {
      steps[`${group}_u${index + 1}`] = [done(laneOutput(group, lane))]
    })
    steps[`${group}_uj`] = picked(group)
    steps[group] = aligned()
  }
  steps.reviewer = [{ type: 'review', verdict: 'pass', issues: [] }, done('审校通过')]
  return { ...steps, ...overrides }
}

async function execute(deps: OrchestratorDeps, input: RunInput = ultraInput) {
  const events: RunEvent[] = []
  const state = await runOrchestration(
    input,
    deps,
    (event) => events.push(event),
    new AbortController().signal,
  )
  expectConsistent(events, state)
  return { events, state }
}

function ultraDeps(overrides: FakeDepsScript['steps'] = {}) {
  return createFakeDeps({
    assess: l2Assessment,
    plan: { plan: l4Plan(), source: 'planner', attempts: [] },
    steps: ultraSteps(overrides),
  })
}

describe('expandUltraPlan', () => {
  it('起点与交付环节 5 路、中间环节 3 路，各接一个择优和一个校准，审校保持原样', () => {
    const plan = l4Plan()
    const expanded = expandUltraPlan(plan)

    expect(plan.nodes.map((node) => laneCountFor(plan, node))).toEqual([5, 5, 3, 5, 3])
    // 5 + 5 + 3 + 5 路，每个环节再加择优与校准，最后是审校。
    expect(expanded).toHaveLength(18 + 4 * 2 + 1)
    expect(expanded.slice(0, 7).map((node) => node.id)).toEqual([
      'research_a_u1',
      'research_a_u2',
      'research_a_u3',
      'research_a_u4',
      'research_a_u5',
      'research_a_uj',
      'research_a',
    ])
    expect(expanded[0]).toMatchObject({ role: 'researcher', title: '严谨·现状调研', dependsOn: [] })
    expect(expanded[4]?.ultra).toEqual({ group: 'research_a', stage: 'lane', lane: 'novel' })
    expect(expanded[5]).toMatchObject({ role: 'judge', title: '择优·现状调研' })
    expect(expanded[5]?.dependsOn).toHaveLength(5)
    expect(expanded[6]).toMatchObject({ role: 'aligner', dependsOn: ['research_a_uj'] })
    const analystLanes = expanded.filter(
      (node) => node.ultra?.group === 'analyst' && node.ultra.stage === 'lane',
    )
    expect(analystLanes.map((node) => node.ultra?.lane)).toEqual(['rigor', 'depth', 'practical'])
    // 下游仍依赖原 id，现在指向校准节点。
    expect(expanded.find((node) => node.id === 'analyst_u1')?.dependsOn).toEqual([
      'research_a',
      'research_b',
    ])
    expect(expanded.at(-1)).toEqual(plan.nodes.at(-1))
    for (const node of expanded) {
      expect(planNodeSchema.safeParse(node).success).toBe(true)
    }
  })

  it('id 与已有节点冲突时追加序号，且不超过 32 个字符', () => {
    const plan = l4Plan()
    const long = 'x'.repeat(32)
    plan.nodes[0] = { ...plan.nodes[0]!, id: long }
    plan.nodes[1] = { ...plan.nodes[1]!, id: `${long.slice(0, 29)}_u1` }
    plan.nodes[2] = { ...plan.nodes[2]!, dependsOn: [long, `${long.slice(0, 29)}_u1`] }

    const ids = expandUltraPlan(plan).map((node) => node.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.length <= 32)).toBe(true)
  })

  it('规划师的计划不得自带 Ultra 角色或字段', () => {
    const plan = l4Plan()
    plan.nodes[0] = {
      ...plan.nodes[0]!,
      ultra: { group: 'research_a', stage: 'lane', lane: 'rigor' },
    }

    expect(validatePlan(plan, { level: 4, allowedTools: [] })).toContainEqual(
      expect.stringContaining('ultra'),
    )
  })
})

describe('Ultra 编排', () => {
  it('固定 L4、展开 27 个节点、使用 Ultra 预算，两个起点环节的 10 路同时开跑', async () => {
    const { deps, calls, maxConcurrent } = ultraDeps()
    const { events, state } = await execute(deps)

    expect(calls.plan[0]).toMatchObject({ level: 4, ultra: true })
    expect(state.decision).toMatchObject({ rawScore: 4, level: 4, ultra: true })
    expect(state.nodeOrder).toHaveLength(27)
    expect(state.budget?.limit).toBe(ULTRA_BUDGET)
    expect(events.find((event) => event.type === 'plan.completed')).toMatchObject({
      budget: ULTRA_BUDGET,
    })
    expect(maxConcurrent()).toBe(10)
    expect(maxConcurrent()).toBeLessThanOrEqual(ULTRA_CONCURRENCY)
    expect(state).toMatchObject({
      status: 'completed',
      degraded: false,
      output: laneOutput('writer', 'depth'),
    })
    // 每个发出的步骤请求都必须通过服务端契约校验。
    for (const call of calls.step) {
      expect(agentStepRequestSchema.safeParse(call.req).success).toBe(true)
    }
  })

  it('择优拿到各路成果与取向，校准拿到采用的一路，下游看到原环节名与完整原文', async () => {
    const { deps, calls } = ultraDeps()
    const { state } = await execute(deps)
    const request = (id: string) => calls.step.find((call) => call.req.node.id === id)?.req

    expect(request('research_a_uj')?.upstream.map((item) => item.output)).toEqual(
      LANES.map((lane) => laneOutput('research_a', lane)),
    )
    expect(request('research_a_uj')?.ultra?.lanes?.map((item) => item.lane)).toEqual(LANES)
    expect(request('analyst_uj')?.ultra?.lanes).toHaveLength(3)
    expect(request('research_a')?.upstream).toEqual([
      {
        nodeId: 'research_a_u2',
        title: '深度·现状调研',
        role: 'researcher',
        output: laneOutput('research_a', 'depth'),
      },
    ])
    expect(request('research_a')?.ultra?.judgeNote).toBe('洞察更深')
    expect(state.nodes.research_a?.output).toBe(laneOutput('research_a', 'depth'))
    expect(request('analyst_u1')?.upstream).toEqual([
      {
        nodeId: 'research_a',
        title: '现状调研',
        role: 'researcher',
        output: laneOutput('research_a', 'depth'),
      },
      {
        nodeId: 'research_b',
        title: '场景调研',
        role: 'researcher',
        output: laneOutput('research_b', 'depth'),
      },
    ])
    expect(request('writer_u5')?.isFinal).toBe(true)
    expect(request('writer_uj')?.isFinal).toBe(false)
    expect(request('writer')?.isFinal).toBe(true)

    const report = ultraReport(state)
    expect(report.map((row) => row.lanes)).toEqual([5, 5, 3, 5])
    expect(report[0]).toMatchObject({
      group: 'research_a',
      winner: 'depth',
      winnerScore: 26.5,
      tie: false,
      alignScore: 8,
      corrected: false,
      status: 'completed',
    })
  })

  it('部分路失败时只用完成的几路择优', async () => {
    const { deps, calls } = ultraDeps({ research_a_u1: failed, research_a_u4: failed })
    const { state } = await execute(deps)
    const judge = calls.step.find((call) => call.req.node.id === 'research_a_uj')?.req

    expect(judge?.ultra?.lanes?.map((item) => item.lane)).toEqual(['depth', 'practical', 'novel'])
    expect(judge?.upstream).toHaveLength(3)
    expect(state).toMatchObject({ status: 'completed', degraded: false })
  })

  it('只剩一路完成时直接采用，不调用择优评审', async () => {
    const { deps, calls } = ultraDeps({
      research_a_u1: failed,
      research_a_u2: failed,
      research_a_u4: failed,
      research_a_u5: failed,
    })
    const { state } = await execute(deps)

    expect(calls.step.some((call) => call.req.node.id === 'research_a_uj')).toBe(false)
    expect(state.nodes.research_a_uj?.judge).toMatchObject({ winner: 'practical', walkover: true })
    expect(state.nodes.research_a?.output).toBe(laneOutput('research_a', 'practical'))
  })

  it('一个环节的所有路都失败时，环节跳过并降级作答', async () => {
    const lanes = Object.fromEntries(LANES.map((_, index) => [`writer_u${index + 1}`, failed]))
    const { deps } = ultraDeps(lanes)
    const { state } = await execute(deps)

    expect(state.nodes.writer_uj?.status).toBe('skipped')
    expect(state.nodes.writer?.status).toBe('skipped')
    expect(state.nodes.fallback_answer?.node.dependsOn).not.toContain('analyst_uj')
    expect(state).toMatchObject({ status: 'completed', degraded: true })
  })

  it('择优或校准失败时不拖垮环节：择优默认取第一路，校准沿用择优结果', async () => {
    const { deps } = ultraDeps({ research_a_uj: failed, research_b: failed })
    const { state } = await execute(deps)

    expect(state.nodes.research_a_uj).toMatchObject({
      status: 'completed',
      judge: { winner: 'rigor', walkover: true },
    })
    expect(state.nodes.research_a?.output).toBe(laneOutput('research_a', 'rigor'))
    expect(state.nodes.research_b).toMatchObject({
      status: 'completed',
      output: laneOutput('research_b', 'depth'),
    })
    expect(state.warnings).toEqual(
      expect.arrayContaining([
        '部分多路择优未完成，已按默认方案继续',
        '部分方向校准未完成，已直接采用择优选中的方案',
      ]),
    )
    expect(state).toMatchObject({ status: 'completed', degraded: false })
  })

  it('审校打回时按规划师原节点返工，材料取原环节的上游', async () => {
    const { deps, calls } = ultraDeps({
      reviewer: [{ type: 'review', verdict: 'revise', issues: ['补充数据'] }, done('打回')],
      writer_r1: [done('修订稿')],
      reviewer_r1: [{ type: 'review', verdict: 'pass', issues: [] }, done('通过')],
    })
    const { state } = await execute(deps)
    const revision = calls.step.find((call) => call.req.node.id === 'writer_r1')?.req

    expect(revision?.node).toMatchObject({ role: 'writer', title: '修订·报告写作' })
    expect(revision?.node.ultra).toBeUndefined()
    expect(revision?.upstream.map((item) => item.nodeId)).toEqual(['analyst'])
    expect(revision?.revision?.previousOutput).toBe(laneOutput('writer', 'depth'))
    expect(state).toMatchObject({ status: 'completed', output: '修订稿' })
  })

  it('规划失败退回单 Agent 时不展开，也不使用 Ultra 预算', async () => {
    const { deps } = createFakeDeps({ assess: l2Assessment })
    const { state } = await execute(deps)

    expect(state.planSource).toBe('fallback')
    expect(state.nodeOrder).toEqual(['answer'])
    expect(state.budget?.limit).not.toBe(ULTRA_BUDGET)
    expect(ultraReport(state)).toEqual([])
  })

  it('寒暄即使开启 Ultra 也照常直答', async () => {
    const { deps, calls } = createFakeDeps()
    const { state } = await execute(deps, { ...ultraInput, task: '你好' })

    expect(calls.plan).toHaveLength(0)
    expect(state.level).toBe(0)
  })

  it('回放事件得到同一张展开图', async () => {
    const { deps } = ultraDeps()
    const { events, state } = await execute(deps)

    expect(reduceEvents(events).nodeOrder).toEqual(state.nodeOrder)
    expect(reduceEvents(events).ultra).toBe(true)
  })
})

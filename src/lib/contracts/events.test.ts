import { describe, expect, expectTypeOf, it } from 'vitest'
import { runEventSchema, type RunEventBody } from './events'

const assessment = {
  dims: { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 },
  rationale: '简单寒暄，直接回答',
  source: 'rule',
}
const decision = { rawScore: 0, adjustment: 0, score: 0, level: 0, downgraded: false }
const node = {
  id: 'answer',
  role: 'specialist',
  title: '直接回答',
  instruction: '直接回答用户的任务',
  dependsOn: [],
  tools: [],
}
const plan = { level: 0, strategy: '直接回答', nodes: [node], outputNodeId: 'answer' }
const usage = { inputTokens: 1, outputTokens: 1 }
const envelope = { seq: 0, t: 0 }

const validEvents = [
  {
    ...envelope,
    type: 'run.started',
    runId: 'run-1',
    assistantId: 'assistant-1',
    task: '你好',
    intensity: 0.5,
  },
  { ...envelope, type: 'assess.started' },
  { ...envelope, type: 'assess.completed', assessment, decision },
  { ...envelope, type: 'plan.started', level: 0 },
  { ...envelope, type: 'plan.attempt_failed', attempt: 1, errors: ['错误'] },
  { ...envelope, type: 'plan.completed', plan, source: 'static', budget: 4000 },
  { ...envelope, type: 'node.added', node, reason: 'fallback' },
  { ...envelope, type: 'node.started', nodeId: 'answer', attempt: 1 },
  { ...envelope, type: 'node.reasoning', nodeId: 'answer', delta: '思考' },
  { ...envelope, type: 'node.text', nodeId: 'answer', delta: '文本' },
  {
    ...envelope,
    type: 'node.tool_call',
    nodeId: 'answer',
    callId: 'call-1',
    tool: 'web_search',
    input: { query: 'AI' },
  },
  {
    ...envelope,
    type: 'node.tool_result',
    nodeId: 'answer',
    callId: 'call-1',
    ok: true,
    summary: '完成',
  },
  { ...envelope, type: 'node.review', nodeId: 'answer', verdict: 'pass', issues: [] },
  { ...envelope, type: 'node.completed', nodeId: 'answer', output: '完成', usage },
  {
    ...envelope,
    type: 'node.failed',
    nodeId: 'answer',
    error: { code: 'upstream_error', message: '失败' },
  },
  { ...envelope, type: 'node.skipped', nodeId: 'answer', reason: '跳过' },
  { ...envelope, type: 'budget.exceeded', used: 5000, limit: 4000 },
  {
    ...envelope,
    type: 'run.completed',
    output: '完成',
    degraded: false,
    usage,
    durationMs: 100,
  },
  {
    ...envelope,
    type: 'run.failed',
    error: { code: 'internal', message: '失败' },
  },
  { ...envelope, type: 'run.cancelled' },
]

describe('runEventSchema', () => {
  it.each(validEvents)('接受 $type', (event) => {
    expect(runEventSchema.safeParse(event).success).toBe(true)
  })

  it.each([
    { ...envelope, seq: -1, type: 'assess.started' },
    { ...envelope, t: 0.5, type: 'assess.started' },
    { ...envelope, type: 'assess.started', extra: true },
    { ...envelope, type: 'unknown' },
  ])('拒绝非法事件 $type', (event) => {
    expect(runEventSchema.safeParse(event).success).toBe(false)
  })

  it('保留流式 delta 的空白', () => {
    const result = runEventSchema.parse({
      ...envelope,
      type: 'node.text',
      nodeId: 'answer',
      delta: ' ',
    })
    expect(result).toMatchObject({ delta: ' ' })
  })

  it('run.completed 接受可选 warnings', () => {
    const event = {
      ...envelope,
      type: 'run.completed',
      output: '完成',
      degraded: true,
      usage,
      durationMs: 100,
      warnings: ['预算不足'],
    }
    expect(runEventSchema.safeParse(event).success).toBe(true)
    expect(runEventSchema.safeParse({ ...event, warnings: Array(6).fill('警告') }).success).toBe(
      false,
    )
  })

  it('RunEventBody 分配式去掉 seq 和 t', () => {
    expectTypeOf<Extract<RunEventBody, { type: 'node.started' }>>().toEqualTypeOf<{
      type: 'node.started'
      nodeId: string
      attempt: number
    }>()
  })
})

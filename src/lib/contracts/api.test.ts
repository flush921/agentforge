import { describe, expect, it } from 'vitest'
import {
  agentStepRequestSchema,
  apiErrorBodySchema,
  assessRequestSchema,
  assessResponseSchema,
  assistantGenerateRequestSchema,
  assistantGenerateResponseSchema,
  healthResponseSchema,
  planRequestSchema,
  planResponseSchema,
  stepEventSchema,
} from './api'

const validDraft = {
  name: '学习助手',
  avatar: '🎓',
  color: '#22d3ee',
  tagline: '帮你制定学习计划',
  domain: '教育',
  directions: ['education'],
  persona: '耐心且严谨。',
  capabilities: ['web_search'],
  defaultIntensity: 0.5,
  guardrails: { refuseTopics: [] },
  starters: ['解释一个概念', '制定学习计划', '分析学习情况'],
}
const validAssistant = {
  ...validDraft,
  id: 'assistant-1',
  schemaVersion: 1,
  createdAt: '2026-10-26T00:00:00.000Z',
  sourcePrompt: '创建学习助手',
}
const validAssessment = {
  dims: { subtasks: 1, tools: 1, parallel: 1, rigor: 1, length: 1 },
  rationale: '需要拆解',
  source: 'llm',
}
const validNode = {
  id: 'answer',
  role: 'specialist',
  title: '回答',
  instruction: '回答任务',
  dependsOn: [],
  tools: [],
}
const validPlan = { level: 2, strategy: '串行完成', nodes: [validNode], outputNodeId: 'answer' }
const validStepRequest = {
  assistant: validAssistant,
  task: '分析学习任务',
  node: validNode,
  isFinal: true,
  upstream: [{ nodeId: 'research', title: '调研', role: 'researcher', output: '结果' }],
}

type SchemaCase = {
  name: string
  schema: { safeParse: (value: unknown) => { success: boolean } }
  valid: unknown
  invalid: unknown[]
}

const cases: SchemaCase[] = [
  {
    name: 'healthResponseSchema',
    schema: healthResponseSchema,
    valid: { ok: true, mode: 'mock', accessRequired: false },
    invalid: [
      { ok: false, mode: 'mock', accessRequired: false },
      { ok: true, mode: 'other', accessRequired: false },
      { ok: true, mode: 'mock' },
      { ok: true, mode: 'mock', accessRequired: 'yes' },
      { ok: true, mode: 'mock', accessRequired: false, extra: true },
    ],
  },
  {
    name: 'assistantGenerateRequestSchema',
    schema: assistantGenerateRequestSchema,
    valid: { prompt: '创建学习助手' },
    invalid: [{ prompt: ' ' }, { prompt: 'x'.repeat(301) }, { prompt: '你好', extra: true }],
  },
  {
    name: 'assistantGenerateResponseSchema',
    schema: assistantGenerateResponseSchema,
    valid: { assistant: validDraft },
    invalid: [
      { assistant: { ...validDraft, tagline: '' } },
      { assistant: validDraft, extra: true },
      { assistant: { ...validDraft, directions: ['other'] } },
    ],
  },
  {
    name: 'assessRequestSchema',
    schema: assessRequestSchema,
    valid: { assistant: validAssistant, task: '分析任务' },
    invalid: [
      { assistant: validAssistant, task: ' ' },
      { assistant: validAssistant, task: 'x'.repeat(4001) },
      { assistant: validAssistant, task: '任务', extra: true },
    ],
  },
  {
    name: 'assessResponseSchema',
    schema: assessResponseSchema,
    valid: { assessment: validAssessment },
    invalid: [
      { assessment: { ...validAssessment, rationale: '' } },
      { assessment: validAssessment, extra: true },
      { assessment: { ...validAssessment, source: 'other' } },
    ],
  },
  {
    name: 'planRequestSchema',
    schema: planRequestSchema,
    valid: { assistant: validAssistant, task: '复杂任务', level: 2, assessment: validAssessment },
    invalid: [
      { assistant: validAssistant, task: '任务', level: 1, assessment: validAssessment },
      { assistant: validAssistant, task: 'x'.repeat(4001), level: 2, assessment: validAssessment },
      { assistant: validAssistant, task: '任务', level: 2, assessment: validAssessment, extra: 1 },
    ],
  },
  {
    name: 'planResponseSchema',
    schema: planResponseSchema,
    valid: { plan: validPlan, source: 'planner', attempts: [{ errors: ['错误'] }] },
    invalid: [
      { plan: validPlan, source: 'static', attempts: [] },
      { plan: validPlan, source: 'planner', attempts: [{ errors: [''] }] },
      { plan: validPlan, source: 'planner', attempts: [], extra: true },
    ],
  },
  {
    name: 'agentStepRequestSchema',
    schema: agentStepRequestSchema,
    valid: validStepRequest,
    invalid: [
      { ...validStepRequest, revision: { round: 3, feedback: '修改', previousOutput: '' } },
      { ...validStepRequest, extra: true },
      { ...validStepRequest, node: { ...validNode, role: 'other' } },
      { ...validStepRequest, isFinal: undefined },
      {
        ...validStepRequest,
        upstream: [{ nodeId: 'Invalid ID', title: '调研', role: 'researcher', output: '结果' }],
      },
      {
        ...validStepRequest,
        revision: { round: 1, feedback: '修改', previousOutput: 'x'.repeat(6001) },
      },
    ],
  },
  {
    name: 'stepEventSchema',
    schema: stepEventSchema,
    valid: { type: 'text', delta: '内容' },
    invalid: [
      { type: 'other' },
      { type: 'text', delta: '内容', extra: true },
      { type: 'review', verdict: 'pass', issues: ['x'.repeat(201)] },
    ],
  },
  {
    name: 'apiErrorBodySchema',
    schema: apiErrorBodySchema,
    valid: { error: { code: 'bad_request', message: '请求错误' } },
    invalid: [
      { error: { code: 'bad_request', message: ' ' } },
      { error: { code: 'bad_request', message: '错误' }, extra: true },
      { error: { code: 'other', message: '错误' } },
    ],
  },
]

describe('api schemas', () => {
  for (const testCase of cases) {
    describe(testCase.name, () => {
      it('接受合法样例', () => {
        expect(testCase.schema.safeParse(testCase.valid).success).toBe(true)
      })

      testCase.invalid.forEach((value, index) => {
        it(`拒绝非法样例 ${index + 1}`, () => {
          expect(testCase.schema.safeParse(value).success).toBe(false)
        })
      })
    })
  }

  it('审校节点至少需要一条上游产出', () => {
    const reviewer = { ...validNode, role: 'reviewer', reviewTarget: 'answer' }
    expect(
      agentStepRequestSchema.safeParse({ ...validStepRequest, node: reviewer, upstream: [] })
        .success,
    ).toBe(false)
  })

  it.each([
    { type: 'reasoning', delta: '思考' },
    { type: 'text', delta: '文本' },
    { type: 'tool_call', callId: 'call-1', tool: 'web_search', input: { query: 'AI' } },
    { type: 'tool_result', callId: 'call-1', ok: true, summary: '完成' },
    { type: 'review', verdict: 'pass', issues: [] },
    { type: 'done', output: '完成', usage: { inputTokens: 1, outputTokens: 1 } },
    {
      type: 'error',
      error: { code: 'upstream_error', message: '失败' },
      retryable: true,
    },
  ])('stepEventSchema 接受事件 $type', (event) => {
    expect(stepEventSchema.safeParse(event).success).toBe(true)
  })

  it('请求字符串会 trim', () => {
    expect(assistantGenerateRequestSchema.parse({ prompt: '  名字  ' }).prompt).toBe('名字')
  })
})

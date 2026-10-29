import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStepRequest, StepEvent } from '@/lib/contracts/api'
import { agentStepRequestSchema } from '@/lib/contracts/api'
import type { Lane } from '@/lib/contracts/plan'
import type { AgentStreamPart, LlmClient } from '@/server/llm/types'
import { fakeLlm } from '@/test/fake-llm'
import { makeStepRequest } from '@/test/step'
import { runAgentStep } from './step'

async function collect(client: LlmClient, req: AgentStepRequest): Promise<StepEvent[]> {
  const events: StepEvent[] = []
  for await (const event of runAgentStep(client, req, new AbortController().signal)) {
    events.push(event)
  }
  return events
}

const ultra = { strategy: '并行调研后汇合写作，再审校' }

const THREE: Lane[] = ['rigor', 'depth', 'practical']
const DRAFTS: Record<Lane, string> = {
  rigor: '严谨稿',
  depth: '深度稿',
  practical: '落地稿',
  breadth: '全面稿',
  novel: '创新稿',
}

function judgeRequest(lanes: Lane[] = THREE): AgentStepRequest {
  const ids = lanes.map((_, index) => `write_u${index + 1}`)
  return makeStepRequest({
    node: {
      id: 'write_uj',
      role: 'judge',
      title: '择优·报告写作',
      instruction: '根据调研资料撰写完整报告',
      dependsOn: ids,
      tools: [],
      ultra: { group: 'write', stage: 'judge' },
    },
    isFinal: false,
    upstream: lanes.map((lane, index) => ({
      nodeId: ids[index]!,
      title: '报告写作',
      role: 'writer',
      output: DRAFTS[lane],
    })),
    ultra: { ...ultra, lanes: lanes.map((lane, index) => ({ nodeId: ids[index]!, lane })) },
  })
}

function alignRequest(overrides: Partial<AgentStepRequest> = {}): AgentStepRequest {
  return makeStepRequest({
    node: {
      id: 'write',
      role: 'aligner',
      title: '校准·报告写作',
      instruction: '根据调研资料撰写完整报告',
      dependsOn: ['write_uj'],
      tools: [],
      ultra: { group: 'write', stage: 'align' },
    },
    isFinal: true,
    upstream: [{ nodeId: 'write_u2', title: '深度·报告写作', role: 'writer', output: '深度稿' }],
    ultra: { ...ultra, judgeNote: '深度稿洞察更深' },
    ...overrides,
  })
}

function json(value: unknown, tokens = 5) {
  return { text: JSON.stringify(value), usage: { inputTokens: tokens, outputTokens: tokens } }
}

function stream(text: string): AgentStreamPart[] {
  return [
    { type: 'step-start' },
    { type: 'text', delta: text },
    { type: 'finish', usage: { inputTokens: 10, outputTokens: 20 } },
  ]
}

describe('Ultra 步骤请求契约', () => {
  it('多路择优至少 2 条上游，每条都要在 ultra.lanes 里标明取向', () => {
    expect(agentStepRequestSchema.safeParse(judgeRequest()).success).toBe(true)
    const single = { ...judgeRequest(), upstream: judgeRequest().upstream.slice(0, 1) }
    expect(agentStepRequestSchema.safeParse(single).success).toBe(false)
    const unlabeled = {
      ...judgeRequest(),
      ultra: { ...ultra, lanes: judgeRequest().ultra?.lanes?.slice(0, 2) },
    }
    expect(agentStepRequestSchema.safeParse(unlabeled).success).toBe(false)
    const withoutContext = { ...judgeRequest(), ultra: undefined }
    expect(agentStepRequestSchema.safeParse(withoutContext).success).toBe(false)
  })

  it('judge / aligner 角色必须带对应的 ultra 阶段', () => {
    const forged = { ...judgeRequest(), node: { ...judgeRequest().node, ultra: undefined } }
    expect(agentStepRequestSchema.safeParse(forged).success).toBe(false)
  })
})

describe('第一层审阅：多路择优', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('正序、倒序各评一次，分数按取向对齐后取平均，由代码决定采用哪一路', async () => {
    // 正序：严谨、深度、落地；倒序：落地、深度、严谨。
    const { client, requests } = fakeLlm([
      json({
        scores: [
          [7, 7, 7],
          [8, 8, 9],
          [6, 6, 6],
        ],
        prefer: 2,
        reason: '洞察更深',
      }),
      json({
        scores: [
          [7, 7, 6],
          [8, 9, 9],
          [8, 7, 6],
        ],
        prefer: 2,
        reason: '更可落地',
      }),
    ])
    const events = await collect(client, judgeRequest())

    expect(requests).toHaveLength(2)
    expect(requests[0]?.kind).toBe('judge')
    expect(requests[0]?.instructions).toContain('交给了 3 个 Agent')
    expect(requests[0]?.messages[0]?.content).toMatch(
      /<candidate no="1">\n严谨稿[\s\S]*<candidate no="3">\n落地稿/,
    )
    expect(requests[1]?.messages[0]?.content).toMatch(
      /<candidate no="1">\n落地稿[\s\S]*<candidate no="3">\n严谨稿/,
    )
    expect(events).toContainEqual({
      type: 'judge',
      result: {
        winner: 'depth',
        scores: [
          { lane: 'rigor', scores: [7.5, 7, 6.5] },
          { lane: 'depth', scores: [8, 8.5, 9] },
          { lane: 'practical', scores: [6.5, 6.5, 6] },
        ],
        reason: '洞察更深',
      },
    })
    expect(events.at(-1)).toEqual({
      type: 'done',
      output: '采用「深度」一路：洞察更深',
      usage: { inputTokens: 10, outputTokens: 10 },
    })
  })

  it('五路时评分条数必须是 5，条数不符就回喂错误重试', async () => {
    const five: Lane[] = ['rigor', 'depth', 'practical', 'breadth', 'novel']
    const reply = (best: number) =>
      json({
        scores: five.map((_, index) => (index === best ? [9, 9, 9] : [6, 6, 6])),
        prefer: best + 1,
        reason: '覆盖最全',
      })
    const { client, requests } = fakeLlm([
      json({
        scores: [
          [9, 9, 9],
          [6, 6, 6],
        ],
        prefer: 1,
        reason: '少了',
      }),
      reply(1),
      reply(3),
    ])
    const events = await collect(client, judgeRequest(five))

    expect(requests).toHaveLength(3)
    expect(requests[0]?.instructions).toContain('交给了 5 个 Agent')
    expect(requests[2]?.messages.at(-1)?.content).toContain('上一次输出未通过校验')
    // 倒序第 2 位与修复后的正序第 4 位都是「全面」。
    expect(events.find((event) => event.type === 'judge')).toMatchObject({
      result: { winner: 'breadth' },
    })
  })

  it('最高分并列时看两次评审的偏好，仍并列就取排在前面的取向', async () => {
    const even = [
      [8, 8, 8],
      [8, 8, 8],
      [8, 8, 8],
    ]
    const tie = fakeLlm([
      json({ scores: even, prefer: 1, reason: '甲' }),
      json({ scores: even, prefer: 1, reason: '乙' }),
    ])
    const events = await collect(tie.client, judgeRequest())

    // 正序偏好严谨，倒序偏好排在最前的落地：一比一，取排在前面的严谨。
    expect(events.find((event) => event.type === 'judge')).toMatchObject({
      result: { winner: 'rigor' },
    })
    expect(events.at(-1)).toMatchObject({
      output: expect.stringContaining('并列最高，按评审偏好'),
    })
  })

  it('一次评审无法解析时只用另一次的结果', async () => {
    // 两次评审并发发起：第 1 条回复给正序评审，第 2、3 条给倒序评审（含一次修复重试）。
    const { client } = fakeLlm([
      json({
        scores: [
          [6, 6, 6],
          [9, 9, 9],
          [7, 7, 7],
        ],
        prefer: 2,
        reason: '更完整',
      }),
      '不是 JSON',
      '还不是 JSON',
    ])
    const events = await collect(client, judgeRequest())

    expect(events.find((event) => event.type === 'judge')).toMatchObject({
      result: {
        winner: 'depth',
        scores: [
          { lane: 'rigor', scores: [6, 6, 6] },
          { lane: 'depth', scores: [9, 9, 9] },
          { lane: 'practical', scores: [7, 7, 7] },
        ],
      },
    })
  })

  it('一次评审调用出错时用另一次的结果，两次都出错才报错', async () => {
    const partial = fakeLlm([
      new Error('network'),
      json({
        scores: [
          [9, 9, 9],
          [6, 6, 6],
          [7, 7, 7],
        ],
        prefer: 1,
        reason: '最可执行',
      }),
    ])
    const events = await collect(partial.client, judgeRequest())
    // 倒序第 1 位是「落地」。
    expect(events.find((event) => event.type === 'judge')).toMatchObject({
      result: { winner: 'practical' },
    })

    const broken = fakeLlm([new Error('network'), new Error('network')])
    const failed = await collect(broken.client, judgeRequest())
    expect(failed.at(-1)).toMatchObject({ type: 'error' })
  })

  it('两次评审都无法解析时默认采用排在最前的一路', async () => {
    const { client } = fakeLlm(['x', 'x', 'x', 'x'])
    const events = await collect(client, judgeRequest())

    expect(events.find((event) => event.type === 'judge')).toMatchObject({
      result: { winner: 'rigor', walkover: true },
    })
  })
})

describe('第二层审阅：方向校准', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('方向一致时沿用择优结果，不调用流式重写', async () => {
    const { client, requests, streamRequests } = fakeLlm([
      json({ score: 8, drift: [], summary: '方向一致' }),
    ])
    const events = await collect(client, alignRequest())

    expect(requests[0]?.kind).toBe('align')
    expect(requests[0]?.instructions).toContain('整体策略：并行调研后汇合写作，再审校')
    expect(requests[0]?.messages[0]?.content).toContain('<judge_note>\n深度稿洞察更深')
    expect(streamRequests).toHaveLength(0)
    expect(events[0]).toEqual({
      type: 'align',
      result: { score: 8, drift: [], summary: '方向一致', aligned: true },
    })
    expect(events.at(-1)).toMatchObject({ type: 'done', output: '深度稿' })
  })

  it('偏离目标时按纠偏意见当场重写，最终节点追加免责声明', async () => {
    const disclaimer = '仅供参考。'
    const { client, streamRequests } = fakeLlm(
      [json({ score: 4, drift: ['回到用户的真实目标'], summary: '偏题' })],
      [stream('校准版')],
    )
    const events = await collect(
      client,
      alignRequest({
        assistant: {
          ...alignRequest().assistant,
          guardrails: { refuseTopics: [], disclaimer },
        },
        upstream: [
          {
            nodeId: 'write_u2',
            title: '深度·报告写作',
            role: 'writer',
            output: `深度稿\n\n> ⚠️ ${disclaimer}`,
          },
        ],
      }),
    )

    expect(events[0]).toMatchObject({ type: 'align', result: { aligned: false, score: 4 } })
    expect(streamRequests).toHaveLength(1)
    expect(streamRequests[0]?.messages[0]?.content).toContain('1. 回到用户的真实目标')
    // 重写材料先去掉免责声明，避免产出里出现两遍。
    expect(streamRequests[0]?.messages[0]?.content).not.toContain(disclaimer)
    expect(events.at(-1)).toEqual({
      type: 'done',
      output: `校准版\n\n> ⚠️ ${disclaimer}`,
      usage: { inputTokens: 15, outputTokens: 25 },
    })
  })

  it('校准输出无法解析时按一致处理', async () => {
    const { client } = fakeLlm(['x', 'x'])
    const events = await collect(client, alignRequest())

    expect(events[0]).toMatchObject({ type: 'align', result: { aligned: true } })
    expect(events.at(-1)).toMatchObject({ type: 'done', output: '深度稿' })
  })
})

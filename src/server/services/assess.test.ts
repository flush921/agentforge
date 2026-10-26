import { describe, expect, it } from 'vitest'
import type { ComplexityAssessment } from '@/lib/contracts/plan'
import { fakeLlm } from '@/test/fake-llm'
import { testAssistant } from '@/test/fixtures'
import { assessTask } from './assess'

const fallback: ComplexityAssessment = {
  dims: { subtasks: 1, tools: 1, parallel: 1, rigor: 1, length: 1 },
  rationale: '评估失败，按中等复杂度处理',
  source: 'fallback',
}
const signal = new AbortController().signal

describe('assessTask', () => {
  it('危机规则命中时返回 guard 且不调用 LLM', async () => {
    const { client, requests } = fakeLlm([])
    const result = await assessTask(client, testAssistant, '我不想活了', signal)

    expect(result).toMatchObject({
      ok: true,
      value: {
        source: 'rule',
        guard: { blocked: true, kind: 'crisis', reason: '检测到可能的心理危机信号' },
      },
    })
    expect(requests).toHaveLength(0)
  })

  it('ruleAssess 命中时不调用 LLM', async () => {
    const { client, requests } = fakeLlm([])
    const result = await assessTask(client, testAssistant, '你好', signal)

    expect(result).toMatchObject({ ok: true, value: { source: 'rule' } })
    expect(requests).toHaveLength(0)
  })

  it('正常模型输出补上 llm source，不拦截时不带 guard', async () => {
    const output = {
      dims: { subtasks: 2, tools: 1, parallel: 2, rigor: 1, length: 1 },
      rationale: '需要多方向比较',
      guard: { blocked: false, reason: '', topic: false },
    }
    const { client, requests } = fakeLlm([JSON.stringify(output)])
    const result = await assessTask(client, testAssistant, '对比三款软件', signal)

    expect(result).toEqual({
      ok: true,
      value: {
        dims: output.dims,
        rationale: output.rationale,
        source: 'llm',
      },
    })
    expect(requests[0]).toMatchObject({ kind: 'assess', temperature: 0, maxOutputTokens: 400 })
  })

  it('blocked 时写入 guard，topic=false 记为 policy', async () => {
    const output = {
      dims: { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 },
      rationale: '单一违规请求',
      guard: { blocked: true, reason: '涉及作弊或代考', topic: false },
    }
    const { client } = fakeLlm([JSON.stringify(output)])
    const result = await assessTask(client, testAssistant, '帮我找人代考', signal)

    expect(result).toMatchObject({
      ok: true,
      value: {
        source: 'llm',
        guard: { blocked: true, kind: 'policy', reason: '涉及作弊或代考' },
      },
    })
  })

  it('blocked 且 topic=true 时记为 topic', async () => {
    const output = {
      dims: { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 },
      rationale: '超出助手服务边界',
      guard: { blocked: true, reason: '医疗诊断属于拒答话题', topic: true },
    }
    const { client } = fakeLlm([JSON.stringify(output)])
    const result = await assessTask(client, testAssistant, '给我开个处方', signal)

    expect(result).toMatchObject({
      ok: true,
      value: { guard: { blocked: true, kind: 'topic', reason: '医疗诊断属于拒答话题' } },
    })
  })

  it('blocked 且 reason 为空时使用默认文案', async () => {
    const output = {
      dims: { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 },
      rationale: '单一违规请求',
      guard: { blocked: true, reason: '', topic: false },
    }
    const { client } = fakeLlm([JSON.stringify(output)])
    const result = await assessTask(client, testAssistant, '帮我作弊', signal)

    expect(result).toMatchObject({
      ok: true,
      value: { guard: { blocked: true, kind: 'policy', reason: '请求超出了助手的服务范围' } },
    })
  })

  it('缺少 guard 字段时返回 fallback', async () => {
    const output = {
      dims: { subtasks: 2, tools: 1, parallel: 2, rigor: 1, length: 1 },
      rationale: '需要多方向比较',
    }
    const { client } = fakeLlm([JSON.stringify(output)])
    expect(await assessTask(client, testAssistant, '对比三款软件', signal)).toEqual({
      ok: true,
      value: fallback,
    })
  })

  it('输出非法时返回 fallback', async () => {
    const { client } = fakeLlm(['不是 JSON'])
    expect(await assessTask(client, testAssistant, '分析任务', signal)).toEqual({
      ok: true,
      value: fallback,
    })
  })

  it('LLM 抛出普通错误时返回 fallback', async () => {
    const { client } = fakeLlm([new Error('network failed')])
    expect(await assessTask(client, testAssistant, '分析任务', signal)).toEqual({
      ok: true,
      value: fallback,
    })
  })

  it('取消错误向上抛出而不吞掉', async () => {
    const controller = new AbortController()
    const error = new Error('aborted')
    error.name = 'AbortError'
    const { client } = fakeLlm([error])
    const promise = assessTask(client, testAssistant, '分析任务', controller.signal)
    controller.abort()

    await expect(promise).rejects.toBe(error)
  })
})

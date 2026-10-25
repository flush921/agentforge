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
  it('ruleAssess 命中时不调用 LLM', async () => {
    const { client, requests } = fakeLlm([])
    const result = await assessTask(client, testAssistant, '你好', signal)

    expect(result).toMatchObject({ ok: true, value: { source: 'rule' } })
    expect(requests).toHaveLength(0)
  })

  it('正常模型输出补上 llm source', async () => {
    const output = {
      dims: { subtasks: 2, tools: 1, parallel: 2, rigor: 1, length: 1 },
      rationale: '需要多方向比较',
    }
    const { client, requests } = fakeLlm([JSON.stringify(output)])
    const result = await assessTask(client, testAssistant, '对比三款软件', signal)

    expect(result).toEqual({ ok: true, value: { ...output, source: 'llm' } })
    expect(requests[0]).toMatchObject({ kind: 'assess', temperature: 0, maxOutputTokens: 300 })
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

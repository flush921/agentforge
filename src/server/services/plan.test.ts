import { describe, expect, it } from 'vitest'
import { APICallError } from 'ai'
import type { Plan } from '@/lib/contracts/plan'
import { createMockPlan } from '@/server/mock/plans'
import { fakeLlm } from '@/test/fake-llm'
import { testAssistant, testAssessment } from '@/test/fixtures'
import { planTask } from './plan'

const signal = new AbortController().signal
const validL2 = createMockPlan(2, ['datetime'])

describe('planTask', () => {
  it('第一次计划合法时直接成功', async () => {
    const { client, requests } = fakeLlm([JSON.stringify(validL2)])
    const result = await planTask(client, testAssistant, '复杂任务', 2, testAssessment, signal)

    expect(result).toMatchObject({
      ok: true,
      value: { plan: validL2, source: 'planner', attempts: [] },
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ kind: 'plan', temperature: 0.3, maxOutputTokens: 2500 })
  })

  it('第一次有环时回喂错误，重试修好后记录一次失败', async () => {
    const cyclic: Plan = {
      ...validL2,
      nodes: validL2.nodes.map((node) =>
        node.id === 'research' ? { ...node, dependsOn: ['polish'] } : node,
      ),
    }
    const { client, requests } = fakeLlm([JSON.stringify(cyclic), JSON.stringify(validL2)])
    const result = await planTask(client, testAssistant, '复杂任务', 2, testAssessment, signal)

    expect(result).toMatchObject({ ok: true, value: { plan: validL2, source: 'planner' } })
    if (result.ok) {
      expect(result.value.attempts).toHaveLength(1)
      expect(result.value.attempts[0]?.errors.join('\n')).toContain('环')
    }
    expect(requests).toHaveLength(2)
    expect(requests[1]?.messages[1]?.content).toBe(JSON.stringify(cyclic))
    expect(requests[1]?.messages[2]?.content).toContain('环')
  })

  it('两次都不合法时返回 fallback 和两次 attempts', async () => {
    const { client, requests } = fakeLlm(['不是 JSON', '{}'])
    const result = await planTask(client, testAssistant, '复杂任务', 2, testAssessment, signal)

    expect(result).toMatchObject({
      ok: true,
      value: { plan: null, source: 'fallback' },
    })
    if (result.ok) {
      expect(result.value.attempts).toHaveLength(2)
    }
    expect(requests).toHaveLength(2)
  })

  it('模型给出的 level 被请求级别覆盖', async () => {
    const validL4 = createMockPlan(4, ['datetime'])
    const wrongLevel = JSON.stringify({ ...validL4, level: 2 })
    const { client } = fakeLlm([wrongLevel])
    const result = await planTask(client, testAssistant, '复杂任务', 4, testAssessment, signal)

    expect(result).toMatchObject({ ok: true, value: { source: 'planner', attempts: [] } })
    if (result.ok) {
      expect(result.value.plan?.level).toBe(4)
    }
  })

  it('过滤助手尚未实现的工具并回喂校验错误', async () => {
    const unsupported = JSON.stringify(createMockPlan(2, ['web_search']))
    const { client, requests } = fakeLlm([unsupported, JSON.stringify(validL2)])
    const result = await planTask(client, testAssistant, '复杂任务', 2, testAssessment, signal)

    expect(result).toMatchObject({ ok: true, value: { plan: validL2 } })
    if (result.ok) {
      expect(result.value.attempts[0]?.errors.join('\n')).toContain('web_search')
    }
    expect(requests[1]?.messages[2]?.content).toContain('web_search')
  })

  function upstream(statusCode: number, isRetryable: boolean): APICallError {
    return new APICallError({
      message: 'upstream',
      url: 'https://example.invalid',
      requestBodyValues: {},
      statusCode,
      isRetryable,
    })
  }

  it('可重试的上游异常等待后重试一次，重试成功则正常返回计划（不再因一次抖动退回单 Agent）', async () => {
    const { client, requests } = fakeLlm([upstream(500, true), JSON.stringify(validL2)])
    const result = await planTask(client, testAssistant, '复杂任务', 2, testAssessment, signal)

    expect(result).toMatchObject({
      ok: true,
      value: { plan: validL2, source: 'planner', attempts: [] },
    })
    expect(requests).toHaveLength(2)
    // 重试发的是同一份请求，不带修复提示。
    expect(requests[1]?.messages).toEqual(requests[0]?.messages)
  })

  it('连续两次可重试异常：返回第二次的异常，不再继续重试', async () => {
    const second = upstream(503, true)
    const { client, requests } = fakeLlm([upstream(500, true), second, JSON.stringify(validL2)])
    const result = await planTask(client, testAssistant, '复杂任务', 2, testAssessment, signal)

    expect(result).toEqual({ ok: false, error: second })
    expect(requests).toHaveLength(2)
  })

  it('不可重试的异常（如 400）直接失败，不浪费一次调用', async () => {
    const error = upstream(400, false)
    const { client, requests } = fakeLlm([error, JSON.stringify(validL2)])
    const result = await planTask(client, testAssistant, '复杂任务', 2, testAssessment, signal)

    expect(result).toEqual({ ok: false, error })
    expect(requests).toHaveLength(1)
  })

  it('重试等待期间被取消时抛出取消，不再发起请求', async () => {
    const controller = new AbortController()
    const { client, requests } = fakeLlm([upstream(500, true), JSON.stringify(validL2)])
    const pending = planTask(
      client,
      testAssistant,
      '复杂任务',
      2,
      testAssessment,
      controller.signal,
    )
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(requests).toHaveLength(1)
  })
})

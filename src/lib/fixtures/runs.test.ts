import { describe, expect, it } from 'vitest'
import type { ToolName } from '../contracts/common'
import { runEventSchema } from '../contracts/events'
import { ruleAssess } from '../orchestrator/level'
import { validatePlan } from '../orchestrator/validate-plan'
import { sampleRunL0, sampleRunL4 } from './runs'

const allTools: ToolName[] = ['web_search', 'calculator', 'datetime', 'chart', 'kb_search']
const cases = [
  { name: 'sampleRunL0', events: sampleRunL0 },
  { name: 'sampleRunL4', events: sampleRunL4 },
]

describe('运行夹具', () => {
  it.each(cases)('$name 的每个事件都通过 runEventSchema', ({ events }) => {
    for (const event of events) {
      expect(runEventSchema.safeParse(event).success).toBe(true)
    }
  })

  it.each(cases)('$name 的 seq 连续且 t 单调不减', ({ events }) => {
    events.forEach((event, index) => {
      expect(event.seq).toBe(index)
      const previous = events[index - 1]
      if (previous) {
        expect(event.t).toBeGreaterThanOrEqual(previous.t)
      }
    })
  })

  it.each(cases)('$name 的计划通过 validatePlan', ({ events }) => {
    const completed = events.find((event) => event.type === 'plan.completed')
    expect(completed).toBeDefined()
    if (completed?.type === 'plan.completed') {
      expect(
        validatePlan(completed.plan, { level: completed.plan.level, allowedTools: allTools }),
      ).toEqual([])
    }
  })

  it('sampleRunL0 使用规则评估和静态计划', () => {
    const assessed = sampleRunL0.find((event) => event.type === 'assess.completed')
    const planned = sampleRunL0.find((event) => event.type === 'plan.completed')

    expect(assessed).toMatchObject({ assessment: { source: 'rule' } })
    if (assessed?.type === 'assess.completed') {
      expect(ruleAssess('你好')).toEqual(assessed.assessment)
    }
    expect(planned).toMatchObject({ source: 'static', plan: { level: 0 } })
  })

  it('sampleRunL4 至少 60 个事件，总时长为 40~60 秒', () => {
    const completed = sampleRunL4.find((event) => event.type === 'run.completed')

    expect(sampleRunL4.length).toBeGreaterThanOrEqual(60)
    expect(completed).toMatchObject({ durationMs: 42000, t: 42000 })
  })

  it('sampleRunL4 的任务和七节点文本流符合演示要求', () => {
    const started = sampleRunL4.find((event) => event.type === 'run.started')
    expect(started).toMatchObject({
      task: '调研大学生使用 AI 学习工具的现状，写一份带数据和建议的分析报告',
    })

    const ids = [
      'research_a',
      'research_b',
      'analyst',
      'writer',
      'reviewer',
      'writer_r1',
      'reviewer_r1',
    ]
    for (const nodeId of ids) {
      const deltas = sampleRunL4.flatMap((event) =>
        event.type === 'node.text' && event.nodeId === nodeId ? [event.delta] : [],
      )
      expect(deltas.length).toBeGreaterThanOrEqual(2)
      expect(deltas.join('')).toMatch(/[\u4e00-\u9fff]/)
    }
  })

  it('sampleRunL4 包含一次搜索工具调用和结果', () => {
    const calls = sampleRunL4.flatMap((event) => (event.type === 'node.tool_call' ? [event] : []))
    const results = sampleRunL4.flatMap((event) =>
      event.type === 'node.tool_result' ? [event] : [],
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ nodeId: 'research_a', tool: 'web_search' })
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ nodeId: 'research_a', callId: 'search_usage_1', ok: true })
  })

  it('sampleRunL4 依次加入返工写作和新审校节点', () => {
    const added = sampleRunL4.flatMap((event) => (event.type === 'node.added' ? [event] : []))

    expect(added.map((event) => event.node.id)).toEqual(['writer_r1', 'reviewer_r1'])
    expect(added[0]).toMatchObject({ revisionOf: 'writer', reason: 'revision' })
    expect(added[1]).toMatchObject({ node: { reviewTarget: 'writer_r1' } })
  })

  it('sampleRunL4 的 run.completed.usage 等于各节点 usage 之和', () => {
    const total = sampleRunL4
      .flatMap((event) => (event.type === 'node.completed' ? [event.usage] : []))
      .reduce(
        (sum, usage) => ({
          inputTokens: sum.inputTokens + usage.inputTokens,
          outputTokens: sum.outputTokens + usage.outputTokens,
        }),
        { inputTokens: 0, outputTokens: 0 },
      )
    const completed = sampleRunL4.find((event) => event.type === 'run.completed')

    expect(completed).toMatchObject({ usage: total })
  })
})

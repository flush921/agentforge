import { describe, expect, it } from 'vitest'
import { testAssistant } from '@/test/fixtures'
import { buildGuardMessage, guardRule, type GuardBlock } from './guard'

const crisisGuard: GuardBlock = {
  blocked: true,
  kind: 'crisis',
  reason: '检测到可能的心理危机信号',
}

describe('guardRule', () => {
  it.each(['自杀', '轻生', '不想活了', '结束生命', '想死', '自残', '割腕'])(
    '命中危机关键词「%s」',
    (keyword) => {
      expect(guardRule(`我最近很绝望，想${keyword}`)).toEqual({
        dims: { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 },
        rationale: '检测到可能的心理危机信号',
        source: 'rule',
        guard: { blocked: true, kind: 'crisis', reason: '检测到可能的心理危机信号' },
      })
    },
  )

  it('去掉空白后判定', () => {
    expect(guardRule('我真的 不 想 活 了')?.guard?.kind).toBe('crisis')
  })

  it('普通任务返回 null', () => {
    expect(guardRule('帮我制定一周复习计划')).toBeNull()
  })

  it('正常通过 complexityAssessmentSchema 校验', async () => {
    const { complexityAssessmentSchema } = await import('../contracts/plan')
    expect(complexityAssessmentSchema.safeParse(guardRule('我不想活了')).success).toBe(true)
  })
})

describe('buildGuardMessage', () => {
  it('crisis 返回求助文案', () => {
    expect(buildGuardMessage(testAssistant, crisisGuard)).toBe(
      '听起来你现在可能很难受，谢谢你愿意说出来。你不需要一个人扛着。\n\n- 可以拨打 **12356** 全国心理援助热线，和专业的人聊一聊\n- 如果你或身边的人有立即的危险，请马上拨打 **110** 或 **120**\n- 也可以先联系一位你信任的家人、朋友或老师\n\n如果你愿意，也可以继续和我说说发生了什么。',
    )
  })

  it('policy 无 disclaimer 时省略引用行', () => {
    const guard: GuardBlock = { blocked: true, kind: 'policy', reason: '涉及作弊或代考' }
    expect(buildGuardMessage(testAssistant, guard)).toBe(
      '抱歉，这个请求我无法协助：涉及作弊或代考。\n\n你可以换个问题试试，例如：「什么是费曼学习法？」',
    )
  })

  it('topic 带 disclaimer 时补充引用行', () => {
    const assistant = {
      ...testAssistant,
      guardrails: {
        refuseTopics: ['医疗处方'],
        disclaimer: '本助手不提供医疗建议，请咨询专业医师。',
      },
    }
    const guard: GuardBlock = { blocked: true, kind: 'topic', reason: '涉及拒答话题：医疗处方' }
    expect(buildGuardMessage(assistant, guard)).toBe(
      '抱歉，这个请求我无法协助：涉及拒答话题：医疗处方。\n\n> 本助手不提供医疗建议，请咨询专业医师。\n\n你可以换个问题试试，例如：「什么是费曼学习法？」',
    )
  })
})

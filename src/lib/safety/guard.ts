import type { AssistantSpec } from '../contracts/assistant'
import type { ComplexityAssessment } from '../contracts/plan'

export type GuardBlock = {
  blocked: true
  reason: string
  kind: 'crisis' | 'policy' | 'topic'
}

const CRISIS_KEYWORDS = ['自杀', '轻生', '不想活了', '结束生命', '想死', '自残', '割腕'] as const

export function guardRule(task: string): ComplexityAssessment | null {
  const normalized = task.replace(/\s+/g, '')
  if (!CRISIS_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return null
  }

  return {
    dims: { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 },
    rationale: '检测到可能的心理危机信号',
    source: 'rule',
    guard: { blocked: true, kind: 'crisis', reason: '检测到可能的心理危机信号' },
  }
}

export function buildGuardMessage(assistant: AssistantSpec, guard: GuardBlock): string {
  if (guard.kind === 'crisis') {
    return '听起来你现在可能很难受，谢谢你愿意说出来。你不需要一个人扛着。\n\n- 可以拨打 **12356** 全国心理援助热线，和专业的人聊一聊\n- 如果你或身边的人有立即的危险，请马上拨打 **110** 或 **120**\n- 也可以先联系一位你信任的家人、朋友或老师\n\n如果你愿意，也可以继续和我说说发生了什么。'
  }

  const disclaimer = assistant.guardrails.disclaimer
  const prefix = `抱歉，这个请求我无法协助：${guard.reason}。\n\n`
  const notice = disclaimer !== undefined ? `> ${disclaimer}\n\n` : ''
  return `${prefix}${notice}你可以换个问题试试，例如：「${assistant.starters[0]}」`
}

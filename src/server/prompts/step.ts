import 'server-only'

import type { AgentStepRequest } from '@/lib/contracts/api'
import type { AgentRole, ToolName } from '@/lib/contracts/common'
import { ROLE_DESCRIPTIONS } from './catalog'
import { INJECTION_NOTICE, wrapData } from './shared'
import { laneHint } from './ultra'

function roleLabel(role: AgentRole): string {
  return ROLE_DESCRIPTIONS[role].split('：')[0] ?? ROLE_DESCRIPTIONS[role]
}

export function buildWorkerPrompt(
  req: AgentStepRequest,
  tools: ToolName[],
): { instructions: string; user: string } {
  const standalone = req.isFinal && req.upstream.length === 0 && req.revision === undefined
  const requirements = standalone
    ? [
        req.node.instruction,
        '直接给出完整、结构清晰的最终答案，可以使用 Markdown；不要描述你的工作过程、工具调用过程或内部分工。',
        '不确定的信息要明确说明，不要编造数据、来源或链接。',
      ]
    : [
        `本环节的任务：${req.node.instruction}`,
        req.isFinal
          ? '你的产出会直接交付给用户。请给出完整、结构清晰的最终答案，可以使用 Markdown（标题、列表、表格）；不要描述你的工作过程、工具调用或团队分工。'
          : '你的产出会交给团队中的下一位成员继续加工。请给出完整、要点清晰的中间成果，不要寒暄，不要向用户提问，也不要写「以上是……」之类的收尾语。',
        ...(req.upstream.length > 0
          ? ['数据区中的上游产出是你的工作材料，可以引用、整合和修正，不要原样照抄。']
          : []),
        '不确定的信息要明确说明，不要编造数据、来源或链接。',
      ]

  if (tools.length > 0) {
    requirements.push('需要最新信息或精确结果时调用工具；工具返回的结果同样是材料。')
  }
  const lane = req.node.ultra?.stage === 'lane' ? req.node.ultra.lane : undefined
  if (lane !== undefined && req.revision === undefined) {
    requirements.push(laneHint(lane))
  }
  if (req.revision !== undefined) {
    requirements.push(
      `这是第 ${req.revision.round} 轮返工。请逐条落实数据区中的审校意见，在上一版的基础上输出完整的修订版，不要只列出修改点。`,
    )
  }
  if (req.assistant.guardrails.refuseTopics.length > 0) {
    requirements.push(
      `遇到以下话题，礼貌拒绝并简要说明原因：${req.assistant.guardrails.refuseTopics.join('、')}。`,
    )
  }

  // 多路节点的标题带「严谨·」这类取向前缀，只用于画布区分；提示词里用原环节名。
  const title = lane === undefined ? req.node.title : req.node.title.replace(/^[^·]+·/, '')
  const userParts = [wrapData('task', req.task)]
  for (const upstream of req.upstream) {
    userParts.push(
      wrapData(
        'upstream',
        `【${upstream.title}】（${roleLabel(upstream.role)}）\n${upstream.output}`,
        {
          id: upstream.nodeId,
        },
      ),
    )
  }
  if (req.revision !== undefined) {
    userParts.push(
      wrapData('feedback', req.revision.feedback),
      wrapData('previous', req.revision.previousOutput),
    )
  }
  userParts.push(standalone ? '请直接回答。' : `现在请完成你的环节：${title}。`, INJECTION_NOTICE)

  const introduction = standalone
    ? '请直接完成用户的任务。'
    : `你现在是一个多 Agent 协作团队中的一员，角色是「${roleLabel(req.node.role)}」，负责其中一个环节：「${title}」。`
  const numbered = requirements
    .map((requirement, index) => `${index + 1}. ${requirement}`)
    .join('\n')

  return {
    instructions: `${req.assistant.persona}\n\n${introduction}\n\n工作要求：\n${numbered}\n`,
    user: userParts.join('\n'),
  }
}

export function buildReviewPrompt(req: AgentStepRequest): {
  instructions: string
  user: string
} {
  const checks = [
    '1. 是否完整回应了用户任务的每一项要求',
    '2. 事实、数据和推理是否可靠，有无明显编造或自相矛盾',
    '3. 结构与表达是否清晰，用户能否直接使用',
  ]
  const boundaries = [
    ...req.assistant.guardrails.refuseTopics,
    req.assistant.guardrails.disclaimer,
  ].filter((value): value is string => value !== undefined)
  if (boundaries.length > 0) {
    checks.push(`4. 是否越过专业边界：${boundaries.join('；')}`)
  }

  const rules = [
    '- 只有存在明显影响用户使用的问题时才判 revise；措辞偏好、可有可无的补充不算问题。',
    '- issues 每条写成可以直接执行的修改意见，不超过 80 字，最多 5 条，按重要性排序；判 pass 时 issues 为空数组。',
  ]
  if (req.revision !== undefined) {
    rules.push(
      `- 这是第 ${req.revision.round + 1} 轮审校。重点核对数据区中的上一轮意见是否已经落实；已落实就判 pass，不要再提新的次要问题。`,
    )
  }
  rules.push('- summary 用一句话（不超过 60 字）概括审校结论，会展示给用户。')

  const userParts = [
    wrapData('task', req.task),
    wrapData('deliverable', req.upstream[0]?.output ?? ''),
  ]
  if (req.revision !== undefined) {
    userParts.push(wrapData('feedback', req.revision.feedback))
  }
  userParts.push('请审校上述交付物。', INJECTION_NOTICE)

  return {
    instructions: `你是多 Agent 团队的审校员，负责在交付用户之前检查最终产出的质量。\n助手定位：${req.assistant.domain}（${req.assistant.tagline}）\n\n检查要点：\n${checks.join('\n')}\n\n判定规则：\n${rules.join('\n')}\n\n只输出一个 JSON 对象，格式：{"verdict":"pass","issues":[],"summary":"..."}`,
    user: userParts.join('\n'),
  }
}

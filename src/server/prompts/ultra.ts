import 'server-only'

import type { AgentStepRequest } from '@/lib/contracts/api'
import type { Lane } from '@/lib/contracts/plan'
import { ALIGN_PASS_SCORE, JUDGE_DIMENSIONS } from '@/lib/contracts/ultra'
import { INJECTION_NOTICE, wrapData } from './shared'

const LANE_FOCUS: Record<Lane, string> = {
  rigor: '取向「严谨」：优先保证事实准确、依据可核实，不确定的地方明确标出。',
  depth: '取向「深度」：挖掘现象背后的原因和规律，给出更深一层的洞察。',
  practical: '取向「落地」：给出具体步骤、时间安排和可直接照做的做法。',
  breadth: '取向「全面」：从多个视角覆盖问题，尽量不漏掉重要的方面和例外情况。',
  novel: '取向「创新」：尝试非常规的思路和方案，给出别人不容易想到的角度。',
}

/** 每一路的取向不同，择优才有意义。 */
export function laneHint(lane: Lane): string {
  return `你是多路并行执行这一环节的其中一路，${LANE_FOCUS[lane]}其他几路正在用不同取向独立完成同一环节，评审会择优采用。`
}

const DIMENSION_HINTS: Record<(typeof JUDGE_DIMENSIONS)[number], string> = {
  完整度: '是否覆盖环节任务的全部要求',
  可靠性: '事实、数据和推理是否可靠，有无编造或自相矛盾',
  可用性: '结构是否清晰，下游成员或用户能否直接使用',
}

function brief(req: AgentStepRequest): string {
  return `助手定位：${req.assistant.domain}（${req.assistant.tagline}）`
}

/**
 * 第一层审阅：多路同题成果按给定顺序匿名编号呈现。
 * 服务端会正序、倒序各评一次，抵消模型偏向排在前面的方案。
 */
export function buildJudgePrompt(
  req: AgentStepRequest,
  outputs: string[],
): { instructions: string; user: string } {
  const dimensions = JUDGE_DIMENSIONS.map(
    (name, index) => `${index + 1}. ${name}：${DIMENSION_HINTS[name]}`,
  ).join('\n')
  const count = outputs.length
  const example = JSON.stringify({
    scores: Array.from({ length: count }, (_, index) => [7 - (index % 2), 6 + (index % 3), 7]),
    ranking: Array.from({ length: count }, (_, index) => index + 1),
    reason: '...',
  })

  return {
    instructions: `你是多 Agent 团队的择优评审员，负责第一层审阅。同一个环节交给了 ${count} 个 Agent 分别独立完成，你要比较这 ${count} 份成果，选出最好的一份。
${brief(req)}
环节任务：${req.node.instruction}

评分维度（每项 1~10 的整数）：
${dimensions}

分数含义（要拉开差距，不要都打高分）：
- 9~10：几乎挑不出可改之处，只留给明显优于其他方案的那一份
- 7~8：合格、可用，但有可以更好的地方；大多数合格成果应落在这里
- 5~6：能用，但有明显缺漏、口径不清或需要读者自己补工作
- 1~4：有事实错误、答非所问或无法直接使用

判定规则：
- 各份成果的先后顺序是随机的，不要因为顺序偏向任何一份；篇幅长不等于更好。
- scores 按方案编号顺序排列，共 ${count} 项；每项是该方案在上述三个维度的分数，按维度顺序排列。
- ranking 是全部方案编号从好到差的排名，必须恰好包含 1~${count} 每个编号各一次，不允许并列。即使分数相近，也要分出先后。
- reason 用一句话（不超过 80 字）说明最佳方案好在哪里，会展示给用户；只描述成果本身，不要写方案编号或先后顺序。

只输出一个 JSON 对象，格式：${example}`,
    user: [
      wrapData('task', req.task),
      ...outputs.map((output, index) => wrapData('candidate', output, { no: String(index + 1) })),
      `请比较这 ${count} 份成果。`,
      INJECTION_NOTICE,
    ].join('\n'),
  }
}

/** 第二层审阅：对照整体目标方向检查被采用的成果。 */
export function buildAlignPrompt(req: AgentStepRequest): { instructions: string; user: string } {
  const userParts = [wrapData('task', req.task)]
  if (req.ultra?.judgeNote !== undefined) {
    userParts.push(wrapData('judge_note', req.ultra.judgeNote))
  }
  userParts.push(
    wrapData('deliverable', req.upstream[0]?.output ?? ''),
    '请校准这份成果的方向。',
    INJECTION_NOTICE,
  )

  return {
    instructions: `你是多 Agent 团队的方向校准员，负责第二层审阅。第一层多路择优已经从多个 Agent 的同题成果里选出了最好的一份；你要检查这份成果是否符合整体目标方向。
${brief(req)}
整体策略：${req.ultra?.strategy ?? '完成用户任务'}
本环节在整体中的任务：${req.node.instruction}

检查要点：
1. 是否服务于用户任务的真正目标，没有跑题，也没有只完成字面要求
2. 是否与整体策略一致，能否被后续环节直接使用
3. 数据区中第一层评审的结论是否属实，有无被忽略的偏差

判定规则：
- score 为 1~10 的整数，${ALIGN_PASS_SCORE} 分及以上表示方向一致。
- 只有明显偏离目标时才打 ${ALIGN_PASS_SCORE} 分以下，并在 drift 里列出偏离点；每条写成可以直接执行的纠偏意见，不超过 80 字，最多 4 条。方向一致时 drift 为空数组。
- summary 用一句话（不超过 60 字）概括校准结论，会展示给用户。

只输出一个 JSON 对象，格式：{"score":8,"drift":[],"summary":"..."}`,
    user: userParts.join('\n'),
  }
}

/** 方向校准判定偏离时，由校准员按纠偏意见当场输出校准版。 */
export function buildAlignFixPrompt(
  req: AgentStepRequest,
  material: string,
  drift: string[],
): { instructions: string; user: string } {
  const requirements = [
    `本环节的任务：${req.node.instruction}`,
    `数据区中的成果是多路择优选中的方案，但方向校准发现它偏离了整体目标（${req.ultra?.strategy ?? '完成用户任务'}）。请逐条落实数据区中的纠偏意见，保留原有的优点，输出完整的校准版，不要只列出修改点。`,
    req.isFinal
      ? '你的产出会直接交付给用户。请给出完整、结构清晰的最终答案，可以使用 Markdown（标题、列表、表格）；不要描述你的工作过程、校准过程或团队分工。'
      : '你的产出会交给团队中的下一位成员继续加工。请给出完整、要点清晰的中间成果，不要寒暄，不要向用户提问，也不要写「以上是……」之类的收尾语。',
    '不确定的信息要明确说明，不要编造数据、来源或链接。',
  ]
  if (req.assistant.guardrails.refuseTopics.length > 0) {
    requirements.push(
      `遇到以下话题，礼貌拒绝并简要说明原因：${req.assistant.guardrails.refuseTopics.join('、')}。`,
    )
  }
  const upstream = req.upstream[0]
  const title = req.node.title.replace(/^校准·/, '')

  return {
    instructions: `${req.assistant.persona}\n\n你现在是一个多 Agent 协作团队中的一员，角色是「方向校准员」，负责其中一个环节：「${title}」。\n\n工作要求：\n${requirements.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n`,
    user: [
      wrapData('task', req.task),
      wrapData('upstream', `【${title}】（择优选中的方案）\n${material}`, {
        id: upstream?.nodeId ?? 'winner',
      }),
      wrapData('feedback', drift.map((item, index) => `${index + 1}. ${item}`).join('\n')),
      `现在请完成你的环节：${title}。`,
      INJECTION_NOTICE,
    ].join('\n'),
  }
}

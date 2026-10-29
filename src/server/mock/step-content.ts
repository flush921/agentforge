import 'server-only'

import type { AgentRole } from '@/lib/contracts/common'

export interface MockStepContentInput {
  role: AgentRole
  title: string
  instruction: string
  task: string
  upstreamTitles: string[]
  isFinal: boolean
  /** Ultra 多路节点的取向名称，各路模板内容因此不同。 */
  lane?: string
  revision?: { feedback: string }
}

const laneFocus: Record<string, string> = {
  严谨: '本路取向严谨：逐项核对事实与依据，不确定之处明确标出。',
  深度: '本路取向深度：追问现象背后的原因，给出更深一层的洞察。',
  落地: '本路取向落地：拆成可照做的步骤，并给出时间安排。',
  全面: '本路取向全面：从多个视角覆盖问题，补齐容易遗漏的例外。',
  创新: '本路取向创新：尝试非常规的思路，给出不容易想到的角度。',
}

const roleFocus: Record<AgentRole, string> = {
  researcher: '优先梳理可核实的事实、信息缺口和不同来源之间的差异，形成便于后续引用的资料要点。',
  analyst: '对材料进行分类和比较，说明关键联系的依据，同时区分确定结论与仍待验证的推测。',
  writer: '把分散材料组织成连贯结构，先呈现核心结论，再补充必要依据、限制条件和可执行建议。',
  coder: '把要求拆成可验证的实现步骤，关注边界条件、错误处理与可维护性，并给出清晰的验证方式。',
  reviewer: '逐项检查任务覆盖、事实依据和表达质量，只记录会实际影响使用的问题。',
  synthesizer: '合并不同方向的材料，消除重复和冲突，保留有价值差异并形成统一的结论框架。',
  specialist: '结合领域常识解释关键概念，给出直接可用的回答，并明确信息不足时不应继续推断的边界。',
  judge: '对照环节要求比较两份同题成果，选出更完整、更可靠、更可用的一份。',
  aligner: '对照整体目标逐条落实纠偏意见，保留择优结果的优点，让成果重新服务于用户的真正需求。',
}

export function buildMockStepContent(input: MockStepContentInput): string {
  const task = input.task.slice(0, 30)
  const upstream = input.upstreamTitles.length > 0 ? input.upstreamTitles.join('、') : '无'
  const revision = input.revision
    ? `已根据审校意见修订：${input.revision.feedback.split('\n')[0]}`
    : undefined
  const overview = `本环节角色为 ${input.role}，围绕「${input.title}」开展工作。具体要求是：${input.instruction}。用户任务摘录为：${task}。可参考的上游成果为：${upstream}。`
  const quality =
    '组织内容时先核对目标与约束，再按重要程度安排要点；缺少依据的地方明确保留不确定性，不补写虚构的数据、来源或链接。'
  const title = input.title.replace(/^(?:修订·|复核·)+/, '')
  const lines: string[] = []

  if (input.isFinal) {
    lines.push('> 当前为离线演示模式，内容由模板生成。')
    lines.push('')
  }
  if (revision !== undefined) {
    lines.push(revision)
  }
  if (input.lane !== undefined) {
    lines.push(laneFocus[input.lane] ?? `本路取向${input.lane}。`)
  }

  if (input.isFinal) {
    lines.push(
      `# ${title}`,
      '## 任务理解',
      overview,
      '## 工作成果',
      `${roleFocus[input.role]}\n\n${quality}`,
      '## 使用建议',
      '后续可对照原始任务逐项检查覆盖情况，将需要进一步核实的信息单独列出，再决定是否需要补充材料或调整结论。',
    )
  } else {
    lines.push(
      `- 环节角色：${input.role}`,
      `- 节点目标：${input.title}`,
      `- 任务与要求：${overview}`,
      `- 工作要点：${roleFocus[input.role]}`,
      `- 质量要求：${quality}`,
      '- 交接说明：以上要点供下一环节继续加工，未确认的信息应随材料一并保留说明。',
    )
  }

  let content = lines.join('\n')
  if (content.length < 150) {
    content +=
      '\n补充说明：本模板只展示离线编排流程，实际结论仍需依据输入材料和模型生成结果进行确认。'
  }
  return content.length > 400 ? `${content.slice(0, 399)}…` : content
}

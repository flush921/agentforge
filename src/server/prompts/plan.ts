import 'server-only'

import type { AssistantSpec } from '@/lib/contracts/assistant'
import type { ToolName } from '@/lib/contracts/common'
import type { ComplexityAssessment } from '@/lib/contracts/plan'
import { LEVELS } from '@/lib/orchestrator/level'
import { roleLines, toolLines } from './catalog'
import { assistantBrief, INJECTION_NOTICE, wrapData } from './shared'

type PlannerLevel = 2 | 3 | 4

const NO_REVIEW =
  '不要使用 reviewer 角色。本级别不设审校：不要添加「核对、检查、审核、复核」这类只做质量检查的节点，最终节点直接产出交付给用户的完整答案。'

const LEVEL_RULES: Record<PlannerLevel, string> = {
  2: `严格串行流水线：节点首尾相接成一条链，每个节点只依赖前一个节点。${NO_REVIEW}`,
  3: `并行扇出再汇合：至少两个节点同时开始（都没有依赖，或依赖同一个节点），并且至少一个节点同时汇合两个以上上游的产出。${NO_REVIEW}`,
  4: '先用并行或串行完成主体工作，再挂一个审校节点作为质量闸门。审校节点的 role 为 reviewer，dependsOn 和 reviewTarget 都只指向最终节点；其他节点都不得依赖审校节点；最终节点不能是审校节点。',
}

/** Ultra 模式下每个节点都会由两个 Agent 并行执行再经两层审阅，宽而浅的图收益最大。 */
const ULTRA_RULE =
  '本次为 Ultra 模式：每个非审校节点都会由两个 Agent 并行完成，再经过对比评审和方向校准。请尽量把主体工作拆成 3~4 个可以同时开始的独立环节，再汇合成最终节点；串行链不超过 3 层。'

export function buildPlanPrompt(
  assistant: AssistantSpec,
  task: string,
  level: PlannerLevel,
  assessment: ComplexityAssessment,
  tools: ToolName[],
  options: { ultra?: boolean } = {},
): { instructions: string; user: string } {
  const config = LEVELS[level]
  const ultra = options.ultra === true && level === 4
  const instructions = `你是多 Agent 编排规划师。请根据任务和指定的编排级别，设计一张由 Agent 节点组成的有向无环图（DAG）。

本次级别：L${level}（${config.label}）
结构要求：${LEVEL_RULES[level]}${ultra ? `\n${ULTRA_RULE}` : ''}
节点数：${ultra ? 5 : config.minNodes}~${config.maxNodes} 个${level === 4 ? '（含审校节点）' : ''}

可用角色：
${roleLines({ reviewer: level === 4 })}

可用工具：
${toolLines(tools)}

设计原则：
1. 每个节点只做一件事。instruction 写给执行该节点的 Agent，说清「做什么、产出什么」，不超过 100 字。
2. 只在真正需要上游产出时才建立依赖；能并行的就不要串行。
3. 所有非审校节点的产出最终都要流向 outputNodeId。最终节点负责产出直接交付给用户的完整答案。
4. 工具只分配给真正需要的节点。
5. title 是 2~8 个字的中文短语，会显示在画布上。
6. strategy 用一句话（不超过 60 字）向用户说明为什么这样拆分。
7. id 用小写英文和下划线，例如 research_market。

只输出一个 JSON 对象，格式：{"strategy":"...","nodes":[{"id":"...","role":"...","title":"...","instruction":"...","dependsOn":[],"tools":[]}],"outputNodeId":"..."}
${level === 4 ? '审校节点需额外带 "reviewTarget" 字段；其他节点不得带该字段。' : '所有节点都不得带 reviewTarget 字段。'}`

  const { dims } = assessment
  const assessmentText = `各维度：subtasks=${dims.subtasks}, tools=${dims.tools}, parallel=${dims.parallel}, rigor=${dims.rigor}, length=${dims.length}；理由：${assessment.rationale}`

  return {
    instructions,
    user: `${wrapData('assistant', assistantBrief(assistant))}\n${wrapData('assessment', assessmentText)}\n${wrapData('task', task)}\n${INJECTION_NOTICE}`,
  }
}

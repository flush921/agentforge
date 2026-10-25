import 'server-only'

import type { AssistantSpec } from '@/lib/contracts/assistant'
import { assistantBrief, INJECTION_NOTICE, wrapData } from './shared'

export function buildAssessPrompt(
  assistant: AssistantSpec,
  task: string,
): { instructions: string; user: string } {
  const instructions = `你是任务复杂度评估器。根据助手的定位和用户的任务，从 5 个维度各打 0、1、2 分。分数用来决定要调度几个 Agent 协作，所以只看「完成任务需要做多少工作」，不看话题听起来是否重要。

评分标准：
- subtasks 子任务数：0 = 单一问题；1 = 2~3 个步骤；2 = 4 个以上步骤，或包含多个独立部分
- tools 外部信息与工具：0 = 凭已有知识即可回答；1 = 需要少量查询或计算；2 = 强依赖最新信息、大量检索或精确计算
- parallel 可并行度：0 = 无法拆分；1 = 有少量可同时进行的部分；2 = 有多个相互独立、可以同时推进的方向
- rigor 严谨要求：0 = 闲聊或开放式创意；1 = 需要准确，但容错较高；2 = 涉及数据、结论或建议，出错代价高，需要复核
- length 产出规模：0 = 几句话；1 = 一段到一页；2 = 多章节的长文或报告

校准示例：
- 「什么是机器学习？」→ subtasks 0, tools 0, parallel 0, rigor 0, length 0
- 「查一下今天是星期几，距离元旦还有多少天」→ subtasks 1, tools 2, parallel 0, rigor 0, length 0
- 「对比三款主流笔记软件，给出选购建议」→ subtasks 2, tools 1, parallel 2, rigor 1, length 1
- 「调研大学生使用 AI 学习工具的现状，写一份带数据和建议的分析报告」→ 全部为 2

rationale 用一句不超过 40 字的中文，向用户说明最主要的判断依据，例如「需要多方向调研并形成严谨报告」。

只输出一个 JSON 对象，格式：{"dims":{"subtasks":0,"tools":0,"parallel":0,"rigor":0,"length":0},"rationale":"..."}`

  return {
    instructions,
    user: `${wrapData('assistant', assistantBrief(assistant))}\n${wrapData('task', task)}\n${INJECTION_NOTICE}`,
  }
}

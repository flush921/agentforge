import 'server-only'

import {
  agentRoleSchema,
  capabilitySchema,
  directionSchema,
  type AgentRole,
  type Capability,
  type Direction,
  type ToolName,
} from '@/lib/contracts/common'

export const DIRECTION_DESCRIPTIONS: Record<Direction, string> = {
  agent: '通用智能体助手，自主规划并调用工具完成任务',
  rag: '基于知识库的问答',
  multimodal: '图文等多模态理解与创作',
  office: '写作、总结、会议、文档等办公提效',
  education: '讲解、出题、学习规划等教育辅导',
  health: '饮食、运动、心理等健康生活服务',
  coding: '编程、代码审查、技术方案',
  data: '数据分析、计算与可视化',
  safety: '内容安全、隐私保护与合规',
  social: '社交、社区与兴趣交流',
}

export const CAPABILITY_DESCRIPTIONS: Record<Capability, string> = {
  web_search: '联网搜索最新信息',
  calculator: '精确计算数学表达式',
  datetime: '获取当前日期与时间',
  chart: '把数据画成图表',
  knowledge_base: '检索用户上传的资料',
  image_input: '理解用户上传的图片',
}

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  web_search: CAPABILITY_DESCRIPTIONS.web_search,
  calculator: CAPABILITY_DESCRIPTIONS.calculator,
  datetime: CAPABILITY_DESCRIPTIONS.datetime,
  chart: CAPABILITY_DESCRIPTIONS.chart,
  kb_search: '检索用户上传的资料',
}

export const ROLE_DESCRIPTIONS: Record<AgentRole, string> = {
  researcher: '调研员：收集资料与事实',
  analyst: '分析师：比较、归纳与推理',
  writer: '写作者：把材料组织成文',
  coder: '程序员：编写代码或完成计算',
  reviewer: '审校员：只做质量检查，不产出正文',
  synthesizer: '整合者：合并多路结果',
  specialist: '领域专家：基于助手的专长直接作答',
}

export const DIRECTION_LINES = directionSchema.options
  .map((direction) => `- ${direction}：${DIRECTION_DESCRIPTIONS[direction]}`)
  .join('\n')

export const CAPABILITY_LINES = capabilitySchema.options
  .map((capability) => `- ${capability}：${CAPABILITY_DESCRIPTIONS[capability]}`)
  .join('\n')

export const ROLE_LINES = agentRoleSchema.options
  .map((role) => `- ${role} ${ROLE_DESCRIPTIONS[role]}`)
  .join('\n')

export function toolLines(tools: ToolName[]): string {
  if (tools.length === 0) {
    return '无。所有节点的 tools 必须是空数组。'
  }

  return tools.map((tool) => `- ${tool}：${TOOL_DESCRIPTIONS[tool]}`).join('\n')
}

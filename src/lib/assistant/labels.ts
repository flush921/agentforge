import type { Capability, Direction } from '../contracts/common'
import { usableTools } from '../orchestrator/tools'

export const DIRECTION_LABELS = {
  agent: '智能体',
  rag: '知识问答',
  multimodal: '多模态',
  office: '协同办公',
  education: '教育学习',
  health: '健康生活',
  coding: '代码开发',
  data: '数据分析',
  safety: '安全治理',
  social: '社交社区',
} as const satisfies Record<Direction, string>

export const CAPABILITY_LABELS = {
  web_search: '联网搜索',
  calculator: '精确计算',
  datetime: '日期时间',
  chart: '图表',
  knowledge_base: '知识库',
  image_input: '图片理解',
} as const satisfies Record<Capability, string>

export function isCapabilityAvailable(capability: Capability): boolean {
  return capability !== 'image_input' && usableTools([capability]).length > 0
}

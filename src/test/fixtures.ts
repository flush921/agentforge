import type { AssistantSpec } from '@/lib/contracts/assistant'
import type { ComplexityAssessment } from '@/lib/contracts/plan'

export const testAssistant: AssistantSpec = {
  id: 'assistant-test',
  schemaVersion: 1,
  createdAt: '2026-10-26T00:00:00.000Z',
  sourcePrompt: '创建一个学习助手',
  name: '学习助手',
  avatar: '🎓',
  color: '#22d3ee',
  tagline: '帮你制定严谨的学习计划',
  domain: '教育规划',
  directions: ['education', 'agent'],
  persona: '你是耐心、严谨的学习伙伴，擅长拆解目标并给出可执行的建议。',
  capabilities: ['datetime', 'web_search'],
  defaultIntensity: 0.5,
  guardrails: { refuseTopics: [] },
  starters: ['什么是费曼学习法？', '帮我制定一周复习计划', '分析我的薄弱科目并给出改进方案'],
}

export const testAssessment: ComplexityAssessment = {
  dims: { subtasks: 2, tools: 1, parallel: 2, rigor: 1, length: 1 },
  rationale: '需要多方向调研并形成报告',
  source: 'llm',
}

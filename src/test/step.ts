import type { AgentStepRequest } from '@/lib/contracts/api'
import { testAssistant } from './fixtures'

export function makeStepRequest(overrides: Partial<AgentStepRequest> = {}): AgentStepRequest {
  return {
    assistant: testAssistant,
    task: '调研大学生使用 AI 学习工具的现状，写一份带数据和建议的分析报告',
    node: {
      id: 'write',
      role: 'writer',
      title: '报告写作',
      instruction: '根据调研资料撰写完整报告',
      dependsOn: ['research'],
      tools: [],
    },
    isFinal: true,
    upstream: [],
    ...overrides,
  }
}

export function makeReviewRequest(overrides: Partial<AgentStepRequest> = {}): AgentStepRequest {
  return makeStepRequest({
    node: {
      id: 'reviewer',
      role: 'reviewer',
      title: '质量审校',
      instruction: '检查最终报告的质量',
      dependsOn: ['write'],
      tools: [],
      reviewTarget: 'write',
    },
    isFinal: false,
    upstream: [{ nodeId: 'write', title: '报告写作', role: 'writer', output: '完整交付物' }],
    ...overrides,
  })
}

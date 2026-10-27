import type { Level, ToolName } from '../contracts/common'
import type { ComplexityAssessment, LevelDecision, Plan } from '../contracts/plan'

export const LEVELS = {
  0: { label: '直答', minNodes: 1, maxNodes: 1, budget: 4000 },
  1: { label: '工具', minNodes: 1, maxNodes: 1, budget: 12000 },
  2: { label: '流水线', minNodes: 2, maxNodes: 3, budget: 30000 },
  3: { label: '并行', minNodes: 3, maxNodes: 6, budget: 60000 },
  4: { label: '审校', minNodes: 4, maxNodes: 8, budget: 100000 },
} as const satisfies Record<
  Level,
  { label: string; minNodes: number; maxNodes: number; budget: number }
>

export const FALLBACK_ASSESSMENT: ComplexityAssessment = {
  dims: { subtasks: 1, tools: 1, parallel: 1, rigor: 1, length: 1 },
  rationale: '评估失败，按中等复杂度处理',
  source: 'fallback',
}

const quickPhrases = new Set([
  '你好',
  '您好',
  '嗨',
  '哈喽',
  '在吗',
  '在不在',
  '谢谢',
  '多谢',
  '感谢',
  '好的',
  '收到',
  '再见',
  '拜拜',
  '早上好',
  '中午好',
  '晚上好',
  '晚安',
  'hi',
  'hello',
  'hey',
  'thanks',
  'thank you',
  'ok',
  'bye',
])

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function ruleAssess(task: string): ComplexityAssessment | null {
  const normalized = task
    .trim()
    .replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '')
    .toLowerCase()

  // 只做整句匹配，避免把「翻译 hello」这类真实任务误判为寒暄。
  if (!quickPhrases.has(normalized)) {
    return null
  }

  return {
    dims: { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 },
    rationale: '简单寒暄，直接回答',
    source: 'rule',
  }
}

export function intensityAdjustment(value: number): number {
  const adjustment = Math.round((value - 0.5) * 4)
  return adjustment === 0 ? 0 : adjustment
}

export function decideLevel(
  dims: ComplexityAssessment['dims'],
  intensity: number,
  hasTools: boolean,
): LevelDecision {
  const rawScore = dims.subtasks + dims.tools + dims.parallel + dims.rigor + dims.length
  const clampedIntensity = clamp(intensity, 0, 1)
  const adjustment = intensityAdjustment(clampedIntensity)
  const score = clamp(rawScore + adjustment, 0, 10)

  let level: Level
  if (score <= 1) {
    level = 0
  } else if (score <= 3) {
    level = 1
  } else if (score <= 5) {
    level = 2
  } else if (score <= 7) {
    level = 3
  } else {
    level = 4
  }

  const downgraded = level === 1 && (dims.tools === 0 || !hasTools)
  if (downgraded) {
    level = 0
  }

  const upgraded = level === 0 && dims.tools >= 1 && hasTools
  if (upgraded) {
    level = 1
  }

  return { rawScore, adjustment, score, level, downgraded, upgraded }
}

export function buildStaticPlan(level: 0 | 1, tools: ToolName[]): Plan {
  if (level === 1) {
    const selectedTools = [...new Set(tools)].slice(0, 4)
    if (selectedTools.length > 0) {
      return {
        level: 1,
        strategy: '需要外部信息或计算，由一个 Agent 调用工具完成',
        nodes: [
          {
            id: 'answer',
            role: 'specialist',
            title: '工具助手',
            instruction: '先用可用工具获取必要的信息或结果，再回答用户的任务',
            dependsOn: [],
            tools: selectedTools,
          },
        ],
        outputNodeId: 'answer',
      }
    }
  }

  return {
    level: 0,
    strategy: '任务简单，由一个 Agent 直接回答',
    nodes: [
      {
        id: 'answer',
        role: 'specialist',
        title: '直接回答',
        instruction: '直接回答用户的任务',
        dependsOn: [],
        tools: [],
      },
    ],
    outputNodeId: 'answer',
  }
}

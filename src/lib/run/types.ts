import type { ApiError, Level, ToolName, Usage } from '../contracts/common'
import type { ComplexityAssessment, LevelDecision, Plan, PlanNode } from '../contracts/plan'
import type { RunStatus } from '../contracts/run-record'
import type { AlignResult, JudgeResult } from '../contracts/ultra'

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export type ToolCallState = {
  callId: string
  tool: ToolName
  input: unknown
  ok?: boolean
  summary?: string
}

export type NodeState = {
  node: PlanNode
  status: NodeStatus
  dynamic: boolean
  revisionOf?: string
  attempt: number
  text: string
  reasoning: string
  toolCalls: ToolCallState[]
  review?: { verdict: 'pass' | 'revise'; issues: string[] }
  judge?: JudgeResult
  align?: AlignResult
  output?: string
  usage?: Usage
  error?: ApiError
  skipReason?: string
  startedAt?: number
  endedAt?: number
}

export type RunState = {
  runId: string | null
  assistantId: string | null
  status: RunStatus
  task: string
  intensity: number
  /** Ultra 超编排：计划中的每个工作节点展开为 3~5 路并行 + 两层审阅。 */
  ultra: boolean
  assessment?: ComplexityAssessment
  decision?: LevelDecision
  level?: Level
  plan?: Plan
  planSource?: 'static' | 'planner' | 'fallback'
  planFailures: string[][]
  nodes: Record<string, NodeState>
  nodeOrder: string[]
  outputNodeId?: string
  usage: Usage
  budget?: { limit: number; used: number; exceeded: boolean }
  output?: string
  degraded: boolean
  warnings: string[]
  error?: ApiError
  lastT: number
  durationMs?: number
}

import { laneSchema, type Lane, type Plan, type PlanNode } from '../contracts/plan'
import { MAX_LANES, MIN_LANES } from '../contracts/ultra'
import type { NodeState, RunState } from '../run/types'

/** Ultra 模式的 token 预算：每个环节 3~5 路并行，外加两层审阅。 */
export const ULTRA_BUDGET = 1_200_000

/**
 * Ultra 模式同时在途的节点上限；普通模式为 3。
 * 多路请求经批量接口合并成少数几条连接，不再受浏览器每个来源 6 条连接的限制。
 * DeepSeek 官方接口实测 24 路并发无限流、无排队。
 */
export const ULTRA_CONCURRENCY = 24

/** 五种取向按这个顺序排列；只有三路的环节用前三种。 */
export const LANES: readonly Lane[] = laneSchema.options

export const LANE_LABELS: Record<Lane, string> = {
  rigor: '严谨',
  depth: '深度',
  practical: '落地',
  breadth: '全面',
  novel: '创新',
}

const ID_MAX = 32

function suffixed(stem: string, suffix: string, taken: Set<string>): string {
  let collision = 1
  while (true) {
    const tail = collision === 1 ? suffix : `${suffix}${collision}`
    const candidate = `${stem.slice(0, ID_MAX - tail.length)}${tail}`
    if (!taken.has(candidate)) {
      taken.add(candidate)
      return candidate
    }
    collision += 1
  }
}

function withPrefix(prefix: string, title: string): string {
  return `${prefix}${title}`.slice(0, 16)
}

/** 只有规划师给出的 L4 计划会展开；退回单 Agent 的兜底计划照常执行。 */
export function isUltraPlan(ultra: boolean, plan: Plan): boolean {
  return ultra && plan.level === 4
}

/**
 * 每个环节的并行路数由代码按它在图中的位置决定：
 * 起点环节从零开始，各路取向差异最大；最终环节直接交付用户。这两类开满 5 路，
 * 中间的汇合、加工环节拿的是已经择优过的材料，开 3 路。
 */
export function laneCountFor(plan: Plan, node: PlanNode): number {
  return node.dependsOn.length === 0 || node.id === plan.outputNodeId ? MAX_LANES : MIN_LANES
}

/**
 * 把规划师的计划展开成 Ultra 执行图。每个工作节点 X 变成：
 * 3~5 个并行执行的多路节点 → 多路择优（第一层审阅）→ 方向校准（第二层审阅，沿用 id X）。
 * 校准节点沿用原 id，下游依赖、最终节点和审校目标都不用改。审校节点保持原样。
 *
 * 纯函数：reducer 回放和编排器调度用的是同一份展开结果。
 */
export function expandUltraPlan(plan: Plan): PlanNode[] {
  const taken = new Set(plan.nodes.map((node) => node.id))
  const expanded: PlanNode[] = []

  for (const node of plan.nodes) {
    if (node.role === 'reviewer') {
      expanded.push(node)
      continue
    }
    const lanes = LANES.slice(0, laneCountFor(plan, node))
    const laneIds = lanes.map((_, index) => suffixed(node.id, `_u${index + 1}`, taken))
    const judge = suffixed(node.id, '_uj', taken)
    lanes.forEach((lane, index) => {
      expanded.push({
        ...node,
        id: laneIds[index]!,
        title: withPrefix(`${LANE_LABELS[lane]}·`, node.title),
        ultra: { group: node.id, stage: 'lane', lane },
      })
    })
    expanded.push({
      id: judge,
      role: 'judge',
      title: withPrefix('择优·', node.title),
      instruction: node.instruction,
      dependsOn: laneIds,
      tools: [],
      ultra: { group: node.id, stage: 'judge' },
    })
    expanded.push({
      id: node.id,
      role: 'aligner',
      title: withPrefix('校准·', node.title),
      instruction: node.instruction,
      dependsOn: [judge],
      tools: [],
      ultra: { group: node.id, stage: 'align' },
    })
  }

  return expanded
}

/** Ultra 节点对应的规划师原节点；普通节点返回自身。 */
export function baseNodeOf(state: RunState, node: PlanNode): PlanNode {
  const group = node.ultra?.group
  if (group === undefined) {
    return node
  }
  return state.plan?.nodes.find((candidate) => candidate.id === group) ?? node
}

/** 择优节点的各路上游，按取向顺序。 */
export function lanesOf(state: RunState, judge: PlanNode): NodeState[] {
  return judge.dependsOn
    .map((id) => state.nodes[id])
    .filter((node): node is NodeState => node !== undefined)
}

/** 方向校准节点的择优节点。 */
export function judgeOf(state: RunState, aligner: PlanNode): NodeState | undefined {
  return state.nodes[aligner.dependsOn[0] ?? '']
}

/** 方向校准节点所在环节被采用的那一路。 */
export function winnerOf(state: RunState, aligner: PlanNode): NodeState | undefined {
  const judge = judgeOf(state, aligner)
  const winner = judge?.judge?.winner
  if (judge === undefined || winner === undefined) {
    return undefined
  }
  return lanesOf(state, judge.node).find((lane) => lane.node.ultra?.lane === winner)
}

/** 多路节点在择优中的结果；择优尚未完成时为 undefined。 */
export function laneOutcome(state: RunState, node: PlanNode): 'picked' | 'unpicked' | undefined {
  if (node.ultra?.stage !== 'lane') {
    return undefined
  }
  const judge = Object.values(state.nodes).find(
    (candidate) => candidate.node.role === 'judge' && candidate.node.dependsOn.includes(node.id),
  )
  const winner = judge?.judge?.winner
  if (winner === undefined) {
    return undefined
  }
  return winner === node.ultra.lane ? 'picked' : 'unpicked'
}

export function totalScore(scores: readonly number[]): number {
  return Math.round(scores.reduce((sum, score) => sum + score, 0) * 10) / 10
}

/** 最高的两路总分持平，采用哪一路由两次评审的平均名次决定。 */
export function isTie(scores: ReadonlyArray<{ scores: readonly number[] }>): boolean {
  const totals = scores.map((item) => totalScore(item.scores)).sort((a, b) => b - a)
  return totals.length >= 2 && totals[0] === totals[1]
}

export interface UltraGroupReport {
  group: string
  title: string
  lanes: number
  /** 实际完成的路数；有路失败时小于 lanes。 */
  finished: number
  winner?: Lane
  winnerScore?: number
  walkover: boolean
  tie: boolean
  alignScore?: number
  corrected: boolean
  status: NodeState['status']
}

/** 每个环节的择优与校准结果，供多路战报展示。 */
export function ultraReport(state: RunState): UltraGroupReport[] {
  if (state.plan === undefined || !isUltraPlan(state.ultra, state.plan)) {
    return []
  }
  return state.plan.nodes.flatMap((node) => {
    const aligner = state.nodes[node.id]
    if (aligner?.node.role !== 'aligner') {
      return []
    }
    const judge = judgeOf(state, aligner.node)
    const result = judge?.judge
    const align = aligner.align
    const winnerScores = result?.scores?.find((item) => item.lane === result.winner)?.scores
    return [
      {
        group: node.id,
        title: node.title,
        lanes: judge?.node.dependsOn.length ?? 0,
        finished:
          judge === undefined
            ? 0
            : lanesOf(state, judge.node).filter((lane) => lane.status === 'completed').length,
        ...(result !== undefined ? { winner: result.winner } : {}),
        ...(winnerScores !== undefined ? { winnerScore: totalScore(winnerScores) } : {}),
        walkover: result?.walkover === true,
        tie: result?.scores !== undefined && isTie(result.scores),
        ...(align !== undefined ? { alignScore: align.score } : {}),
        corrected: align !== undefined && !align.aligned,
        status: aligner.status,
      },
    ]
  })
}

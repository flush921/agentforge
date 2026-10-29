import type { Level, ToolName } from '../contracts/common'
import type { Plan, PlanNode } from '../contracts/plan'
import { LEVELS } from './level'

function findCycle(nodes: Map<string, PlanNode>): string[] | null {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []
  let cycle: string[] | null = null

  function visit(id: string): boolean {
    if (visiting.has(id)) {
      cycle = [...stack.slice(stack.indexOf(id)), id]
      return true
    }
    if (visited.has(id)) {
      return false
    }

    visiting.add(id)
    stack.push(id)
    const node = nodes.get(id)
    if (node) {
      for (const dependency of node.dependsOn) {
        if (nodes.has(dependency) && visit(dependency)) {
          return true
        }
      }
    }

    stack.pop()
    visiting.delete(id)
    visited.add(id)
    return false
  }

  for (const id of nodes.keys()) {
    if (visit(id)) {
      break
    }
  }

  return cycle
}

function collectOutputAncestors(nodes: Map<string, PlanNode>, outputNodeId: string): Set<string> {
  const ancestors = new Set<string>()

  function visit(id: string) {
    if (ancestors.has(id)) {
      return
    }
    ancestors.add(id)

    const node = nodes.get(id)
    if (node) {
      for (const dependency of node.dependsOn) {
        if (nodes.has(dependency)) {
          visit(dependency)
        }
      }
    }
  }

  if (nodes.has(outputNodeId)) {
    visit(outputNodeId)
  }
  return ancestors
}

function computeDepths(nodes: Map<string, PlanNode>): Map<string, number> {
  const depths = new Map<string, number>()

  function depth(id: string): number {
    const cached = depths.get(id)
    if (cached !== undefined) {
      return cached
    }

    const node = nodes.get(id)
    if (!node) {
      return 0
    }

    let result = 0
    for (const dependency of node.dependsOn) {
      if (nodes.has(dependency)) {
        result = Math.max(result, depth(dependency) + 1)
      }
    }
    depths.set(id, result)
    return result
  }

  for (const id of nodes.keys()) {
    depth(id)
  }
  return depths
}

function groupByDepth(
  nodes: Map<string, PlanNode>,
  depths: Map<string, number>,
): Map<number, string[]> {
  const groups = new Map<number, string[]>()
  for (const id of nodes.keys()) {
    const depth = depths.get(id) ?? 0
    groups.set(depth, [...(groups.get(depth) ?? []), id])
  }
  return groups
}

export function validatePlan(
  plan: Plan,
  ctx: { level: Level; allowedTools: ToolName[] },
): string[] {
  const errors: string[] = []
  if (plan.level !== ctx.level) {
    errors.push(`计划（输出节点 ${plan.outputNodeId}）级别为 L${plan.level}，应为 L${ctx.level}`)
  }

  const nodes = new Map<string, PlanNode>()
  for (const node of plan.nodes) {
    if (nodes.has(node.id)) {
      errors.push(`节点 id 重复：${node.id}`)
    } else {
      nodes.set(node.id, node)
    }
  }

  for (const node of plan.nodes) {
    for (const dependency of node.dependsOn) {
      if (dependency === node.id) {
        errors.push(`节点 ${node.id} 不能依赖自身`)
      }
      if (!nodes.has(dependency)) {
        errors.push(`节点 ${node.id} 依赖了不存在的节点 ${dependency}`)
      }
    }
  }

  const cycle = findCycle(nodes)
  if (cycle) {
    errors.push(`计划存在依赖环：${cycle.join(' → ')}`)
  }

  const outputExists = nodes.has(plan.outputNodeId)
  if (!outputExists) {
    errors.push(`最终节点 ${plan.outputNodeId} 不存在`)
  } else {
    const ancestors = collectOutputAncestors(nodes, plan.outputNodeId)
    for (const node of plan.nodes) {
      if (node.role !== 'reviewer' && !ancestors.has(node.id)) {
        errors.push(`节点 ${node.id} 的产出无法流向最终节点 ${plan.outputNodeId}`)
      }
    }
  }

  const config = LEVELS[ctx.level]
  if (plan.nodes.length < config.minNodes || plan.nodes.length > config.maxNodes) {
    errors.push(
      `节点数 ${plan.nodes.length} 不符合 L${ctx.level} 的 ${config.minNodes}..${config.maxNodes} 限制（输出节点 ${plan.outputNodeId}）`,
    )
  }

  const allowedTools = new Set(ctx.allowedTools)
  for (const node of plan.nodes) {
    for (const tool of node.tools) {
      if (!allowedTools.has(tool)) {
        errors.push(`节点 ${node.id} 使用了未授权工具 ${tool}`)
      }
    }
  }

  const workNodes = new Map<string, PlanNode>()
  for (const node of plan.nodes) {
    if (node.role !== 'reviewer' && !workNodes.has(node.id)) {
      workNodes.set(node.id, node)
    }
  }

  // 环存在时深度没有定义；其他不依赖深度的检查仍继续执行。
  const depths = cycle === null ? computeDepths(workNodes) : new Map<string, number>()
  const depthGroups = cycle === null ? groupByDepth(workNodes, depths) : new Map<number, string[]>()

  if (ctx.level === 0) {
    for (const node of plan.nodes) {
      if (node.tools.length > 0) {
        errors.push(`L0 节点 ${node.id} 不得携带工具`)
      }
    }
  } else if (ctx.level === 1) {
    for (const node of workNodes.values()) {
      if (node.tools.length === 0) {
        errors.push(`L1 节点 ${node.id} 至少需要 1 个工具`)
      }
    }
  } else if (ctx.level === 2 && cycle === null) {
    for (const [depth, ids] of depthGroups) {
      if (ids.length > 1) {
        errors.push(`L2 节点 ${ids.join('、')} 同处深度 ${depth}，必须严格串行`)
      }
    }
  } else if (ctx.level === 3) {
    if (cycle === null && ![...depthGroups.values()].some((ids) => ids.length >= 2)) {
      errors.push(`L3 计划（输出节点 ${plan.outputNodeId}）至少需要一个包含 2 个节点的并行深度`)
    }
    if (![...workNodes.values()].some((node) => node.dependsOn.length >= 2)) {
      errors.push(`L3 计划（输出节点 ${plan.outputNodeId}）至少需要一个汇合 2 个上游的节点`)
    }
  }

  const reviewers = plan.nodes.filter((node) => node.role === 'reviewer')
  const reviewerIds = new Set(reviewers.map((node) => node.id))
  if (ctx.level !== 4) {
    for (const reviewer of reviewers) {
      errors.push(`L${ctx.level} 节点 ${reviewer.id} 不得是审校节点`)
    }
  } else {
    if (reviewers.length !== 1) {
      errors.push(
        `L4 计划（输出节点 ${plan.outputNodeId}）必须恰好有 1 个审校节点，当前为 ${reviewers.length} 个`,
      )
    }

    for (const reviewer of reviewers) {
      if (reviewer.reviewTarget !== plan.outputNodeId) {
        errors.push(`审校节点 ${reviewer.id} 的 reviewTarget 必须等于 ${plan.outputNodeId}`)
      }
      if (reviewer.dependsOn.length !== 1 || reviewer.dependsOn[0] !== reviewer.reviewTarget) {
        errors.push(
          `审校节点 ${reviewer.id} 的 dependsOn 必须正好是 [${reviewer.reviewTarget ?? '未设置'}]`,
        )
      }
      if (reviewer.id === plan.outputNodeId) {
        errors.push(`审校节点 ${reviewer.id} 不能是最终节点`)
      }
    }
  }

  for (const node of plan.nodes) {
    for (const dependency of node.dependsOn) {
      if (reviewerIds.has(dependency)) {
        errors.push(`节点 ${node.id} 不能依赖审校节点 ${dependency}`)
      }
    }
  }

  // Ultra 的多路、择优与校准节点由编排器展开生成，规划师的计划里不能自带。
  for (const node of plan.nodes) {
    if (node.role === 'judge' || node.role === 'aligner' || node.ultra !== undefined) {
      errors.push(`节点 ${node.id} 不得使用 ${node.role} 角色或 ultra 字段`)
    }
  }

  return errors
}

import type { RunEvent } from '../contracts/events'
import type { PlanNode } from '../contracts/plan'
import type { NodeState, RunState } from './types'

function createNodeState(node: PlanNode, dynamic: boolean, revisionOf?: string): NodeState {
  return {
    node,
    status: 'pending',
    dynamic,
    ...(revisionOf !== undefined ? { revisionOf } : {}),
    attempt: 0,
    text: '',
    reasoning: '',
    toolCalls: [],
  }
}

function nextT(state: RunState, t: number): number {
  return Math.max(state.lastT, t)
}

function updateNode(
  state: RunState,
  nodeId: string,
  t: number,
  update: (node: NodeState) => NodeState,
): RunState {
  const node = state.nodes[nodeId]
  if (!node) {
    return state
  }

  return {
    ...state,
    lastT: nextT(state, t),
    nodes: { ...state.nodes, [nodeId]: update(node) },
  }
}

function closeOpenNodes(
  nodes: Record<string, NodeState>,
  t: number,
  reason: string,
): Record<string, NodeState> {
  return Object.fromEntries(
    Object.entries(nodes).map(([id, node]) => [
      id,
      node.status === 'pending' || node.status === 'running'
        ? { ...node, status: 'skipped', skipReason: reason, endedAt: t }
        : node,
    ]),
  )
}

export function initialRunState(): RunState {
  return {
    runId: null,
    assistantId: null,
    status: 'idle',
    task: '',
    intensity: 0.5,
    planFailures: [],
    nodes: {},
    nodeOrder: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    degraded: false,
    lastT: 0,
  }
}

export function applyEvent(state: RunState, event: RunEvent): RunState {
  if (event.type === 'run.started') {
    const fresh = initialRunState()
    return {
      ...fresh,
      runId: event.runId,
      assistantId: event.assistantId,
      task: event.task,
      intensity: event.intensity,
      status: 'assessing',
      lastT: nextT(fresh, event.t),
    }
  }

  if (state.runId === null) {
    return state
  }

  // 迟到的网络事件不能把已经结束的运行重新激活。
  if (state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled') {
    return state
  }

  switch (event.type) {
    case 'assess.started':
      return { ...state, status: 'assessing', lastT: nextT(state, event.t) }
    case 'assess.completed':
      return {
        ...state,
        assessment: event.assessment,
        decision: event.decision,
        level: event.decision.level,
        lastT: nextT(state, event.t),
      }
    case 'plan.started':
      return { ...state, status: 'planning', lastT: nextT(state, event.t) }
    case 'plan.attempt_failed':
      return {
        ...state,
        planFailures: [...state.planFailures, event.errors],
        lastT: nextT(state, event.t),
      }
    case 'plan.completed': {
      const nodes: Record<string, NodeState> = {}
      for (const node of event.plan.nodes) {
        nodes[node.id] = createNodeState(node, false)
      }

      return {
        ...state,
        status: 'running',
        level: event.plan.level,
        plan: event.plan,
        planSource: event.source,
        outputNodeId: event.plan.outputNodeId,
        nodes,
        nodeOrder: event.plan.nodes.map((node) => node.id),
        budget: { limit: event.budget, used: 0, exceeded: false },
        lastT: nextT(state, event.t),
      }
    }
    case 'node.added': {
      if (state.nodes[event.node.id]) {
        return state
      }

      const becomesOutput =
        event.reason === 'fallback' ||
        (event.revisionOf !== undefined && event.revisionOf === state.outputNodeId)
      return {
        ...state,
        outputNodeId: becomesOutput ? event.node.id : state.outputNodeId,
        nodes: {
          ...state.nodes,
          [event.node.id]: createNodeState(event.node, true, event.revisionOf),
        },
        nodeOrder: [...state.nodeOrder, event.node.id],
        lastT: nextT(state, event.t),
      }
    }
    case 'node.started': {
      const node = state.nodes[event.nodeId]
      if (!node) {
        return state
      }

      return {
        ...state,
        status: 'running',
        lastT: nextT(state, event.t),
        nodes: {
          ...state.nodes,
          [event.nodeId]: {
            ...node,
            status: 'running',
            attempt: event.attempt,
            text: '',
            reasoning: '',
            toolCalls: [],
            error: undefined,
            endedAt: undefined,
            startedAt: event.t,
          },
        },
      }
    }
    case 'node.reasoning':
      return updateNode(state, event.nodeId, event.t, (node) => ({
        ...node,
        reasoning: node.reasoning + event.delta,
      }))
    case 'node.text':
      return updateNode(state, event.nodeId, event.t, (node) => ({
        ...node,
        text: node.text + event.delta,
      }))
    case 'node.tool_call':
      return updateNode(state, event.nodeId, event.t, (node) => ({
        ...node,
        toolCalls: [
          ...node.toolCalls,
          { callId: event.callId, tool: event.tool, input: event.input },
        ],
      }))
    case 'node.tool_result': {
      const node = state.nodes[event.nodeId]
      if (!node?.toolCalls.some((call) => call.callId === event.callId)) {
        return state
      }

      return updateNode(state, event.nodeId, event.t, (current) => ({
        ...current,
        toolCalls: current.toolCalls.map((call) =>
          call.callId === event.callId ? { ...call, ok: event.ok, summary: event.summary } : call,
        ),
      }))
    }
    case 'node.review':
      return updateNode(state, event.nodeId, event.t, (node) => ({
        ...node,
        review: { verdict: event.verdict, issues: event.issues },
      }))
    case 'node.completed': {
      const node = state.nodes[event.nodeId]
      if (!node) {
        return state
      }

      const addedTokens = event.usage.inputTokens + event.usage.outputTokens
      return {
        ...state,
        usage: {
          inputTokens: state.usage.inputTokens + event.usage.inputTokens,
          outputTokens: state.usage.outputTokens + event.usage.outputTokens,
        },
        ...(state.budget
          ? { budget: { ...state.budget, used: state.budget.used + addedTokens } }
          : {}),
        nodes: {
          ...state.nodes,
          [event.nodeId]: {
            ...node,
            status: 'completed',
            output: event.output,
            usage: event.usage,
            endedAt: event.t,
          },
        },
        lastT: nextT(state, event.t),
      }
    }
    case 'node.failed':
      return updateNode(state, event.nodeId, event.t, (node) => ({
        ...node,
        status: 'failed',
        error: event.error,
        endedAt: event.t,
      }))
    case 'node.skipped':
      return updateNode(state, event.nodeId, event.t, (node) => ({
        ...node,
        status: 'skipped',
        skipReason: event.reason,
        endedAt: event.t,
      }))
    case 'budget.exceeded': {
      const budget = state.budget ?? { limit: event.limit, used: 0, exceeded: false }
      return {
        ...state,
        budget: { ...budget, used: event.used, exceeded: true },
        lastT: nextT(state, event.t),
      }
    }
    case 'run.completed':
      return {
        ...state,
        status: 'completed',
        output: event.output,
        degraded: event.degraded,
        durationMs: event.durationMs,
        usage: event.usage,
        nodes: closeOpenNodes(state.nodes, event.t, '未执行'),
        lastT: nextT(state, event.t),
      }
    case 'run.failed':
      return {
        ...state,
        status: 'failed',
        error: event.error,
        nodes: closeOpenNodes(state.nodes, event.t, '运行失败'),
        lastT: nextT(state, event.t),
      }
    case 'run.cancelled':
      return {
        ...state,
        status: 'cancelled',
        nodes: closeOpenNodes(state.nodes, event.t, '已取消'),
        lastT: nextT(state, event.t),
      }
  }
}

export function reduceEvents(events: readonly RunEvent[]): RunState {
  return events.reduce((state, event) => applyEvent(state, event), initialRunState())
}

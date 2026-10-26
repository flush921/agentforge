import type { AgentStepRequest, StepEvent } from '../contracts/api'
import type { ApiError } from '../contracts/common'
import type { AssistantSpec } from '../contracts/assistant'
import type { RunEvent, RunEventBody } from '../contracts/events'
import type { ComplexityAssessment, LevelDecision, Plan, PlanNode } from '../contracts/plan'
import { applyEvent, initialRunState } from '../run/reducer'
import type { NodeState, RunState } from '../run/types'
import { buildGuardMessage, guardRule } from '../safety/guard'
import type { OrchestratorDeps } from './http-deps'
import { nextNodeId } from './ids'
import { buildStaticPlan, decideLevel, FALLBACK_ASSESSMENT, LEVELS, ruleAssess } from './level'
import { usableTools } from './tools'
import { validatePlan } from './validate-plan'

export type { OrchestratorDeps } from './http-deps'

export interface RunInput {
  assistant: AssistantSpec
  task: string
  intensity: number
}

type Revision = NonNullable<AgentStepRequest['revision']>
type PlanSource = 'static' | 'planner' | 'fallback'

interface Context {
  input: RunInput
  deps: OrchestratorDeps
  onEvent: (event: RunEvent) => void
  controller: AbortController
  signal: AbortSignal
  state: RunState
  startedAt: number
  seq: number
  lastT: number
  warnings: string[]
  revisions: Map<string, Revision>
  reviseCount: number
  running: Map<string, Promise<void>>
}

interface BufferState {
  text: string
  reasoning: string
  lastFlush: number
}

function isTerminal(ctx: Context): boolean {
  return ['completed', 'failed', 'cancelled'].includes(ctx.state.status)
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
  )
}

function abortError(): DOMException {
  return new DOMException('aborted', 'AbortError')
}

function throwIfAborted(ctx: Context): void {
  if (ctx.signal.aborted) {
    throw abortError()
  }
}

function readNow(deps: OrchestratorDeps, fallback: number): number {
  try {
    const value = deps.now()
    return Number.isFinite(value) ? value : fallback
  } catch {
    return fallback
  }
}

function stamp(ctx: Context, body: RunEventBody): RunEvent {
  const now = readNow(ctx.deps, ctx.startedAt + ctx.lastT)
  const t = Math.max(ctx.lastT, Math.round(now - ctx.startedAt))
  const seq = ctx.seq
  ctx.seq += 1
  ctx.lastT = t
  if (body.type === 'run.completed') {
    return { ...body, seq, t, durationMs: t }
  }
  return { ...body, seq, t }
}

function emit(ctx: Context, body: RunEventBody): void {
  // 终态后可能仍有节点 Promise 落地，不能再让迟到事件改变界面或调度状态。
  if (isTerminal(ctx)) {
    return
  }
  const event = stamp(ctx, body)
  ctx.state = applyEvent(ctx.state, event)
  try {
    ctx.onEvent(event)
  } catch {
    // 回调是外部代码；其异常转成一次内部失败，且不能继续向外抛出。
    fail(ctx, { code: 'internal', message: '服务内部错误' })
  }
}

function warn(ctx: Context, message: string): void {
  if (!ctx.warnings.includes(message)) {
    ctx.warnings.push(message)
  }
}

function fail(ctx: Context, error: ApiError): void {
  emit(ctx, { type: 'run.failed', error })
  ctx.controller.abort()
}

function cancel(ctx: Context): void {
  emit(ctx, { type: 'run.cancelled' })
}

async function assess(
  ctx: Context,
): Promise<{ assessment: ComplexityAssessment; decision: LevelDecision }> {
  let assessment = guardRule(ctx.input.task)
  if (assessment === null) {
    assessment = ruleAssess(ctx.input.task)
  }
  if (assessment === null) {
    try {
      const response = await ctx.deps.assess(
        { assistant: ctx.input.assistant, task: ctx.input.task },
        ctx.signal,
      )
      throwIfAborted(ctx)
      assessment = response.assessment
    } catch (error) {
      if (isAbort(error, ctx.signal)) {
        throw error
      }
      assessment = FALLBACK_ASSESSMENT
    }
  }

  const decision = decideLevel(
    assessment.dims,
    ctx.input.intensity,
    usableTools(ctx.input.assistant.capabilities).length > 0,
  )
  emit(ctx, { type: 'assess.completed', assessment, decision })
  return { assessment, decision }
}

async function plan(
  ctx: Context,
  assessment: ComplexityAssessment,
  decision: LevelDecision,
): Promise<void> {
  const level = decision.level
  const tools = usableTools(ctx.input.assistant.capabilities)
  emit(ctx, { type: 'plan.started', level })

  let source: PlanSource
  let plan: Plan | undefined
  if (level === 0 || level === 1) {
    source = 'static'
    plan = buildStaticPlan(level, tools)
  } else {
    source = 'planner'
    try {
      const response = await ctx.deps.plan(
        { assistant: ctx.input.assistant, task: ctx.input.task, level, assessment },
        ctx.signal,
      )
      throwIfAborted(ctx)
      for (const [index, attempt] of response.attempts.entries()) {
        emit(ctx, { type: 'plan.attempt_failed', attempt: index + 1, errors: attempt.errors })
      }
      if (response.plan !== null) {
        const errors = validatePlan(response.plan, { level, allowedTools: tools })
        if (errors.length === 0) {
          plan = response.plan
        } else {
          emit(ctx, {
            type: 'plan.attempt_failed',
            attempt: response.attempts.length + 1,
            errors,
          })
        }
      }
    } catch (error) {
      if (isAbort(error, ctx.signal)) {
        throw error
      }
    }
  }

  if (plan === undefined) {
    plan = buildStaticPlan(1, tools)
    source = 'fallback'
    warn(ctx, '编排规划失败，已退回单 Agent 执行')
  }
  emit(ctx, { type: 'plan.completed', plan, source, budget: LEVELS[plan.level].budget })
}

function materialIds(state: RunState, node: PlanNode): string[] {
  function walk(current: PlanNode, seen: Set<string>): string[] {
    if (seen.has(current.id)) {
      return []
    }
    seen.add(current.id)
    const revisionOf = state.nodes[current.id]?.revisionOf
    if (revisionOf !== undefined) {
      const original = state.nodes[revisionOf]?.node
      return original === undefined ? [] : walk(original, seen)
    }
    return current.dependsOn
  }

  return walk(node, new Set())
}

function upstreamFor(ctx: Context, node: PlanNode): AgentStepRequest['upstream'] {
  const ids =
    node.role === 'reviewer' && node.reviewTarget !== undefined
      ? [node.reviewTarget]
      : materialIds(ctx.state, node)

  // 返工节点必须递归取原节点的材料，不能误用被审版本的产出。
  return ids.flatMap((id) => {
    const state = ctx.state.nodes[id]
    if (state?.status !== 'completed' || state.output === undefined) {
      return []
    }
    return [
      {
        nodeId: id,
        title: state.node.title,
        role: state.node.role,
        output: state.output.slice(0, 6000),
      },
    ]
  })
}

function requestFor(ctx: Context, node: PlanNode): AgentStepRequest {
  const revision = ctx.revisions.get(node.id)
  return {
    assistant: ctx.input.assistant,
    task: ctx.input.task,
    node,
    isFinal: node.id === ctx.state.outputNodeId,
    upstream: upstreamFor(ctx, node),
    ...(revision === undefined ? {} : { revision }),
  }
}

function flush(ctx: Context, nodeId: string, buffer: BufferState): void {
  const now = readNow(ctx.deps, buffer.lastFlush)
  // 同一个缓冲区有两种内容时固定先 reasoning，保证回放顺序稳定。
  if (buffer.reasoning.length > 0) {
    emit(ctx, { type: 'node.reasoning', nodeId, delta: buffer.reasoning })
    buffer.reasoning = ''
  }
  if (buffer.text.length > 0) {
    emit(ctx, { type: 'node.text', nodeId, delta: buffer.text })
    buffer.text = ''
  }
  buffer.lastFlush = now
}

function bufferDelta(ctx: Context, nodeId: string, buffer: BufferState, event: StepEvent): void {
  if (event.type !== 'text' && event.type !== 'reasoning') {
    return
  }
  buffer[event.type] += event.delta
  if (readNow(ctx.deps, buffer.lastFlush) - buffer.lastFlush >= 50) {
    flush(ctx, nodeId, buffer)
  }
}

async function attemptError(
  ctx: Context,
  nodeId: string,
  attempt: number,
  error: ApiError,
  retryable: boolean,
): Promise<'retry' | 'failed'> {
  if (retryable && attempt === 1) {
    await ctx.deps.sleep(1000, ctx.signal)
    throwIfAborted(ctx)
    return 'retry'
  }
  emit(ctx, { type: 'node.failed', nodeId, error })
  return 'failed'
}

async function runAttempt(
  ctx: Context,
  nodeId: string,
  attempt: number,
): Promise<'done' | 'retry' | 'failed'> {
  const node = ctx.state.nodes[nodeId]?.node
  if (node === undefined) {
    return 'failed'
  }
  const buffer: BufferState = {
    text: '',
    reasoning: '',
    lastFlush: readNow(ctx.deps, ctx.startedAt),
  }
  emit(ctx, { type: 'node.started', nodeId, attempt })
  if (isTerminal(ctx)) {
    return 'failed'
  }

  try {
    for await (const event of ctx.deps.step(requestFor(ctx, node), ctx.signal)) {
      throwIfAborted(ctx)
      if (event.type === 'text' || event.type === 'reasoning') {
        bufferDelta(ctx, nodeId, buffer, event)
        continue
      }
      flush(ctx, nodeId, buffer)
      if (event.type === 'tool_call') {
        emit(ctx, {
          type: 'node.tool_call',
          nodeId,
          callId: event.callId,
          tool: event.tool,
          input: event.input,
        })
      } else if (event.type === 'tool_result') {
        emit(ctx, {
          type: 'node.tool_result',
          nodeId,
          callId: event.callId,
          ok: event.ok,
          summary: event.summary,
        })
      } else if (event.type === 'review') {
        emit(ctx, { type: 'node.review', nodeId, verdict: event.verdict, issues: event.issues })
      } else if (event.type === 'done') {
        emit(ctx, { type: 'node.completed', nodeId, output: event.output, usage: event.usage })
        return 'done'
      } else if (event.type === 'error') {
        return await attemptError(ctx, nodeId, attempt, event.error, event.retryable)
      }
    }
  } catch (error) {
    if (isAbort(error, ctx.signal)) {
      throw error
    }
    flush(ctx, nodeId, buffer)
    return attemptError(
      ctx,
      nodeId,
      attempt,
      { code: 'upstream_error', message: '网络连接失败' },
      true,
    )
  }

  flush(ctx, nodeId, buffer)
  return attemptError(ctx, nodeId, attempt, { code: 'upstream_error', message: '连接中断' }, true)
}

function handleReview(ctx: Context, reviewerId: string): void {
  const reviewer = ctx.state.nodes[reviewerId]
  const review = reviewer?.review
  if (reviewer === undefined || review === undefined || review.verdict === 'pass') {
    return
  }
  ctx.reviseCount += 1
  const round = ctx.reviseCount
  if (round > 2) {
    warn(ctx, '审校仍有未解决的意见，已采用最后一版产出')
    return
  }
  const budget = ctx.state.budget
  if (budget !== undefined && budget.used >= budget.limit) {
    warn(ctx, '预算不足，未进行返工')
    return
  }

  const targetId = reviewer?.node.reviewTarget
  const target = targetId === undefined ? undefined : ctx.state.nodes[targetId]
  if (targetId === undefined || target?.output === undefined) {
    return
  }
  const disclaimer = ctx.input.assistant.guardrails.disclaimer
  const suffix = `\n\n> ⚠️ ${disclaimer ?? ''}`
  const previousOutput =
    disclaimer !== undefined && target.output.endsWith(suffix)
      ? target.output.slice(0, -suffix.length)
      : target.output
  const revision: Revision = {
    round,
    feedback: review.issues
      .map((issue, index) => `${index + 1}. ${issue}`)
      .join('\n')
      .slice(0, 2000),
    previousOutput: previousOutput.slice(0, 6000),
  }
  const revisionId = nextNodeId(targetId, round, new Set(ctx.state.nodeOrder))
  const reviewId = nextNodeId(reviewerId, round, new Set([...ctx.state.nodeOrder, revisionId]))
  const revisionNode: PlanNode = {
    ...target.node,
    id: revisionId,
    title: `修订·${target.node.title}`.slice(0, 16),
    dependsOn: [targetId],
  }
  const reviewNode: PlanNode = {
    ...reviewer.node,
    id: reviewId,
    title: `复核·${reviewer.node.title}`.slice(0, 16),
    dependsOn: [revisionId],
    reviewTarget: revisionId,
  }

  emit(ctx, { type: 'node.added', node: revisionNode, reason: 'revision', revisionOf: targetId })
  ctx.revisions.set(revisionId, revision)
  emit(ctx, { type: 'node.added', node: reviewNode, reason: 'revision' })
  ctx.revisions.set(reviewId, revision)
}

async function executeNode(ctx: Context, nodeId: string): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const outcome = await runAttempt(ctx, nodeId, attempt)
    throwIfAborted(ctx)
    if (outcome !== 'retry') {
      break
    }
  }

  const node = ctx.state.nodes[nodeId]
  if (node?.status === 'completed' && node.node.role === 'reviewer') {
    handleReview(ctx, nodeId)
  }
}

function startNode(ctx: Context, nodeId: string): void {
  const promise = executeNode(ctx, nodeId).catch((error: unknown) => {
    if (isAbort(error, ctx.signal)) {
      return
    }
    emit(ctx, {
      type: 'node.failed',
      nodeId,
      error: { code: 'upstream_error', message: '网络连接失败' },
    })
  })
  const tracked = promise.finally(() => {
    ctx.running.delete(nodeId)
  })
  ctx.running.set(nodeId, tracked)
}

function ready(ctx: Context, id: string): boolean {
  const node = ctx.state.nodes[id]
  return (
    node?.status === 'pending' &&
    node.node.dependsOn.every((dependency) => ctx.state.nodes[dependency]?.status === 'completed')
  )
}

function markUnreachable(ctx: Context): void {
  let changed = true
  while (changed && !isTerminal(ctx)) {
    changed = false
    for (const id of ctx.state.nodeOrder) {
      const node = ctx.state.nodes[id]
      if (node?.status !== 'pending') {
        continue
      }
      const blocked = node.node.dependsOn.some((dependency) => {
        const status = ctx.state.nodes[dependency]?.status
        return status === 'failed' || status === 'skipped'
      })
      if (blocked) {
        emit(ctx, { type: 'node.skipped', nodeId: id, reason: '上游环节未完成' })
        changed = true
      }
    }
  }
}

function budgetExceeded(ctx: Context): boolean {
  const budget = ctx.state.budget
  return budget !== undefined && budget.used >= budget.limit
}

function enforceBudget(ctx: Context): void {
  const budget = ctx.state.budget
  if (budget === undefined || budget.used < budget.limit) {
    return
  }
  // 启动任何新节点前先封住预算；事件只发一次，pending 全部收尾。
  if (!budget.exceeded) {
    emit(ctx, { type: 'budget.exceeded', used: budget.used, limit: budget.limit })
  }
  for (const id of ctx.state.nodeOrder) {
    if (ctx.state.nodes[id]?.status === 'pending') {
      emit(ctx, { type: 'node.skipped', nodeId: id, reason: '预算已用尽' })
    }
  }
}

async function schedule(ctx: Context): Promise<void> {
  while (!isTerminal(ctx)) {
    throwIfAborted(ctx)
    markUnreachable(ctx)
    enforceBudget(ctx)

    for (const id of ctx.state.nodeOrder) {
      if (ctx.running.size >= 3 || budgetExceeded(ctx)) {
        break
      }
      if (ready(ctx, id)) {
        startNode(ctx, id)
      }
    }
    if (isTerminal(ctx)) {
      return
    }
    if (ctx.running.size === 0) {
      return
    }

    await Promise.race([...ctx.running.values()])
    throwIfAborted(ctx)
  }
}

function lastCompleted(ctx: Context): NodeState | undefined {
  return ctx.state.nodeOrder
    .map((id) => ctx.state.nodes[id])
    .filter((node): node is NodeState => node !== undefined)
    .filter(
      (node) =>
        node.status === 'completed' && node.node.role !== 'reviewer' && node.output !== undefined,
    )
    .at(-1)
}

function complete(ctx: Context, output: string, degraded: boolean): void {
  if (
    Object.values(ctx.state.nodes).some(
      (node) => node.node.role === 'reviewer' && ['failed', 'skipped'].includes(node.status),
    )
  ) {
    warn(ctx, '审校未完成，产出未经复核')
  }
  emit(ctx, {
    type: 'run.completed',
    output,
    degraded,
    usage: ctx.state.usage,
    durationMs: 0,
    warnings: [...new Set(ctx.warnings)].slice(0, 5),
  })
}

async function finalize(ctx: Context): Promise<void> {
  throwIfAborted(ctx)
  const outputNode =
    ctx.state.outputNodeId === undefined ? undefined : ctx.state.nodes[ctx.state.outputNodeId]
  if (outputNode?.status === 'completed' && outputNode.output !== undefined) {
    complete(ctx, outputNode.output, false)
    return
  }

  if (budgetExceeded(ctx)) {
    const latest = lastCompleted(ctx)
    if (latest?.output === undefined) {
      fail(ctx, { code: 'internal', message: '预算已用尽且没有可用产出' })
      return
    }
    warn(ctx, '预算已用尽，以下为已完成环节的阶段性成果')
    complete(ctx, latest.output, true)
    return
  }

  if (lastCompleted(ctx) === undefined) {
    fail(ctx, outputNode?.error ?? { code: 'internal', message: '最终环节未能完成' })
    return
  }

  const dependencies = ctx.state.nodeOrder
    .filter((id) => {
      const node = ctx.state.nodes[id]
      return node?.status === 'completed' && node.node.role !== 'reviewer'
    })
    .slice(-6)
  const existing = new Set(ctx.state.nodeOrder)
  const fallbackId = existing.has('fallback_answer')
    ? nextNodeId('fallback_answer', 1, existing)
    : 'fallback_answer'
  const fallbackNode: PlanNode = {
    id: fallbackId,
    role: 'specialist',
    title: '降级作答',
    instruction: '部分环节未能完成。请基于已有材料直接完成用户的任务，并说明哪些部分可能不完整',
    dependsOn: dependencies,
    tools: [],
  }
  emit(ctx, { type: 'node.added', node: fallbackNode, reason: 'fallback' })
  startNode(ctx, fallbackId)
  const pending = ctx.running.get(fallbackId)
  if (pending !== undefined) {
    await pending
    throwIfAborted(ctx)
  }

  const fallback = ctx.state.nodes[fallbackId]
  if (fallback?.status === 'completed' && fallback.output !== undefined) {
    warn(ctx, '部分环节失败，已由单个 Agent 基于现有材料作答')
    complete(ctx, fallback.output, true)
  } else {
    fail(ctx, fallback?.error ?? { code: 'internal', message: '服务内部错误' })
  }
}

export async function runOrchestration(
  input: RunInput,
  deps: OrchestratorDeps,
  onEvent: (event: RunEvent) => void,
  signal: AbortSignal,
): Promise<RunState> {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (signal.aborted) {
    controller.abort()
  }
  signal.addEventListener('abort', onAbort, { once: true })

  const ctx: Context = {
    input,
    deps,
    onEvent,
    controller,
    signal: controller.signal,
    state: initialRunState(),
    startedAt: readNow(deps, 0),
    seq: 0,
    lastT: 0,
    warnings: [],
    revisions: new Map(),
    reviseCount: 0,
    running: new Map(),
  }

  try {
    emit(ctx, {
      type: 'run.started',
      runId: deps.newRunId(),
      assistantId: input.assistant.id,
      task: input.task,
      intensity: input.intensity,
    })
    emit(ctx, { type: 'assess.started' })
    if (isTerminal(ctx)) {
      return ctx.state
    }

    const evaluation = await assess(ctx)
    throwIfAborted(ctx)
    if (isTerminal(ctx)) {
      return ctx.state
    }
    const guard = evaluation.assessment.guard
    if (guard?.blocked) {
      warn(ctx, '已按安全护栏拒绝执行')
      complete(ctx, buildGuardMessage(input.assistant, guard), false)
      return ctx.state
    }
    await plan(ctx, evaluation.assessment, evaluation.decision)
    throwIfAborted(ctx)
    if (isTerminal(ctx)) {
      return ctx.state
    }
    const pendingPlan = ctx.state.plan
    const confirmPlan = ctx.deps.confirmPlan
    if (
      pendingPlan !== undefined &&
      ctx.state.planSource === 'planner' &&
      confirmPlan !== undefined
    ) {
      const accepted = await confirmPlan(pendingPlan, ctx.state, ctx.signal)
      if (!accepted) {
        cancel(ctx)
        return ctx.state
      }
      throwIfAborted(ctx)
    }
    await schedule(ctx)
    throwIfAborted(ctx)
    if (isTerminal(ctx)) {
      return ctx.state
    }
    await finalize(ctx)
    throwIfAborted(ctx)
  } catch (error) {
    if (isAbort(error, ctx.signal)) {
      cancel(ctx)
    } else {
      fail(ctx, { code: 'internal', message: '服务内部错误' })
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
  }

  return ctx.state
}

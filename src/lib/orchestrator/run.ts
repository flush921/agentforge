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
import {
  baseNodeOf,
  isUltraPlan,
  judgeOf,
  LANE_LABELS,
  lanesOf,
  ULTRA_BUDGET,
  ULTRA_CONCURRENCY,
  winnerOf,
} from './ultra'
import { validatePlan } from './validate-plan'

export type { OrchestratorDeps } from './http-deps'

export interface RunInput {
  assistant: AssistantSpec
  task: string
  intensity: number
  /** Ultra 超编排：固定 L4，并把每个工作环节展开为 3~5 路并行 + 两层审阅。 */
  ultra?: boolean
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

  const scored = decideLevel(
    assessment.dims,
    ctx.input.intensity,
    usableTools(ctx.input.assistant.capabilities).length > 0,
  )
  // 用户手动开启 Ultra 时级别固定为 L4；评估得分照常展示。
  const decision: LevelDecision =
    // 寒暄（规则命中）不值得动用 Ultra，照常直答。
    ctx.input.ultra === true && assessment.guard === undefined && assessment.source !== 'rule'
      ? {
          rawScore: scored.rawScore,
          adjustment: scored.adjustment,
          score: scored.score,
          level: 4,
          downgraded: false,
          ultra: true,
        }
      : scored
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
        {
          assistant: ctx.input.assistant,
          task: ctx.input.task,
          level,
          assessment,
          ...(decision.ultra === true ? { ultra: true } : {}),
        },
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
  const budget = isUltraPlan(ctx.state.ultra, plan) ? ULTRA_BUDGET : LEVELS[plan.level].budget
  emit(ctx, { type: 'plan.completed', plan, source, budget })
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
    // Ultra 校准节点的 dependsOn 是本环节的评审节点；返工要回到规划师原节点的材料。
    return baseNodeOf(state, current).dependsOn
  }

  return walk(node, new Set())
}

function upstreamItem(state: RunState, id: string): AgentStepRequest['upstream'] {
  const node = state.nodes[id]
  if (node?.status !== 'completed' || node.output === undefined) {
    return []
  }
  const base = baseNodeOf(state, node.node)
  return [
    {
      nodeId: id,
      // 校准节点的产出就是本环节的成果，下游看到的应是原环节名与角色。
      title: node.node.role === 'aligner' ? base.title : node.node.title,
      role: node.node.role === 'aligner' ? base.role : node.node.role,
      output: node.output.slice(0, 6000),
    },
  ]
}

function upstreamFor(ctx: Context, node: PlanNode): AgentStepRequest['upstream'] {
  if (node.role === 'reviewer' && node.reviewTarget !== undefined) {
    return upstreamItem(ctx.state, node.reviewTarget)
  }
  if (node.role === 'judge') {
    return node.dependsOn.flatMap((id) => upstreamItem(ctx.state, id))
  }
  if (node.role === 'aligner') {
    const winner = winnerOf(ctx.state, node)
    return winner === undefined ? [] : upstreamItem(ctx.state, winner.node.id)
  }
  // 返工节点必须递归取原节点的材料，不能误用被审版本的产出。
  return materialIds(ctx.state, node).flatMap((id) => upstreamItem(ctx.state, id))
}

function ultraContextFor(ctx: Context, node: PlanNode): AgentStepRequest['ultra'] {
  const strategy = ctx.state.plan?.strategy
  if (node.ultra === undefined || strategy === undefined) {
    return undefined
  }
  const judgeNote = node.role === 'aligner' ? judgeOf(ctx.state, node)?.judge?.reason : undefined
  // 择优评审只拿已完成的几路；失败的一路不参加比较。
  const lanes =
    node.role === 'judge'
      ? lanesOf(ctx.state, node).flatMap((item) =>
          item.status === 'completed' && item.node.ultra?.lane !== undefined
            ? [{ nodeId: item.node.id, lane: item.node.ultra.lane }]
            : [],
        )
      : []
  return {
    strategy,
    ...(judgeNote === undefined ? {} : { judgeNote }),
    ...(lanes.length > 0 ? { lanes } : {}),
  }
}

function requestFor(ctx: Context, node: PlanNode): AgentStepRequest {
  const revision = ctx.revisions.get(node.id)
  const ultra = ultraContextFor(ctx, node)
  // 最终环节的每一路都按交付稿的要求写，被采用的一份会直接交给用户。
  const finalId = node.ultra?.stage === 'lane' ? node.ultra.group : node.id
  return {
    assistant: ctx.input.assistant,
    task: ctx.input.task,
    node,
    isFinal: finalId === ctx.state.outputNodeId,
    upstream: upstreamFor(ctx, node),
    ...(revision === undefined ? {} : { revision }),
    ...(ultra === undefined ? {} : { ultra }),
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
  if (bypassUltraGate(ctx, nodeId)) {
    return 'failed'
  }
  emit(ctx, { type: 'node.failed', nodeId, error })
  return 'failed'
}

/**
 * Ultra 的两层审阅失败时不拖垮整个环节：择优失败默认采用排在最前的一路，
 * 校准失败直接沿用被采用的一路。两种情况都记一条警告。
 */
function bypassUltraGate(ctx: Context, nodeId: string): boolean {
  const node = ctx.state.nodes[nodeId]
  if (node?.node.role === 'judge') {
    const pick = lanesOf(ctx.state, node.node).find((item) => item.status === 'completed')?.node
      .ultra?.lane
    if (pick === undefined) {
      return false
    }
    const reason = `多路择优未完成，默认采用「${LANE_LABELS[pick]}」一路`
    warn(ctx, '部分多路择优未完成，已按默认方案继续')
    emit(ctx, { type: 'node.judge', nodeId, result: { winner: pick, reason, walkover: true } })
    emit(ctx, {
      type: 'node.completed',
      nodeId,
      output: reason,
      usage: { inputTokens: 0, outputTokens: 0 },
    })
    return true
  }
  if (node?.node.role === 'aligner') {
    const winner = winnerOf(ctx.state, node.node)
    if (winner?.output === undefined) {
      return false
    }
    warn(ctx, '部分方向校准未完成，已直接采用择优选中的方案')
    emit(ctx, {
      type: 'node.completed',
      nodeId,
      output: winner.output,
      usage: { inputTokens: 0, outputTokens: 0 },
    })
    return true
  }
  return false
}

/**
 * 方向校准判定一致时，服务端不重写成果，本环节的产出就是被采用那一路的完整原文
 * （请求里的上游材料截断过 6000 字，不能拿来当产出）。
 */
function completedOutput(ctx: Context, nodeId: string, output: string): string {
  const node = ctx.state.nodes[nodeId]
  if (node?.node.role !== 'aligner' || node.align?.aligned !== true) {
    return output
  }
  return winnerOf(ctx.state, node.node)?.output ?? output
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
      } else if (event.type === 'judge') {
        emit(ctx, { type: 'node.judge', nodeId, result: event.result })
      } else if (event.type === 'align') {
        emit(ctx, { type: 'node.align', nodeId, result: event.result })
      } else if (event.type === 'done') {
        emit(ctx, {
          type: 'node.completed',
          nodeId,
          output: completedOutput(ctx, nodeId, event.output),
          usage: event.usage,
        })
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
  // Ultra 下审校的是校准节点；返工交回规划师原节点的角色和指令，而不是再做一次校准。
  const base = baseNodeOf(ctx.state, target.node)
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
    ...base,
    id: revisionId,
    title: `修订·${base.title}`.slice(0, 16),
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

/** 多路里只有一路完成时不调用评审模型，直接采用完成的那一路。 */
function walkover(ctx: Context, judgeId: string): boolean {
  const judge = ctx.state.nodes[judgeId]
  if (judge?.node.role !== 'judge') {
    return false
  }
  const finished = lanesOf(ctx.state, judge.node).filter((item) => item.status === 'completed')
  const survivor = finished[0]?.node.ultra?.lane
  if (finished.length !== 1 || survivor === undefined) {
    return false
  }
  const reason = `其余各路未能完成，直接采用「${LANE_LABELS[survivor]}」一路`
  emit(ctx, { type: 'node.started', nodeId: judgeId, attempt: 1 })
  emit(ctx, {
    type: 'node.judge',
    nodeId: judgeId,
    result: { winner: survivor, reason, walkover: true },
  })
  emit(ctx, {
    type: 'node.completed',
    nodeId: judgeId,
    output: reason,
    usage: { inputTokens: 0, outputTokens: 0 },
  })
  return true
}

async function executeNode(ctx: Context, nodeId: string): Promise<void> {
  if (walkover(ctx, nodeId)) {
    return
  }
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

function dependencyStatuses(ctx: Context, node: PlanNode): Array<NodeState['status'] | undefined> {
  return node.dependsOn.map((dependency) => ctx.state.nodes[dependency]?.status)
}

function isDead(status: NodeState['status'] | undefined): boolean {
  return status === 'failed' || status === 'skipped'
}

function ready(ctx: Context, id: string): boolean {
  const node = ctx.state.nodes[id]
  if (node?.status !== 'pending') {
    return false
  }
  const statuses = dependencyStatuses(ctx, node.node)
  // 对比评审只要两路都结束且至少一路完成就能开始，另一路失败时由完成的一路晋级。
  if (node.node.role === 'judge') {
    return (
      statuses.every((status) => status === 'completed' || isDead(status)) &&
      statuses.includes('completed')
    )
  }
  return statuses.every((status) => status === 'completed')
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
      const statuses = dependencyStatuses(ctx, node.node)
      const blocked = node.node.role === 'judge' ? statuses.every(isDead) : statuses.some(isDead)
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

    const plan = ctx.state.plan
    const limit = plan !== undefined && isUltraPlan(ctx.state.ultra, plan) ? ULTRA_CONCURRENCY : 3
    for (const id of ctx.state.nodeOrder) {
      if (ctx.running.size >= limit || budgetExceeded(ctx)) {
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
    .filter((node) => node.status === 'completed' && isMaterial(node) && node.output !== undefined)
    .at(-1)
}

/** 审校和对比评审只产出结论，不能当作交付材料。 */
function isMaterial(node: NodeState): boolean {
  return node.node.role !== 'reviewer' && node.node.role !== 'judge'
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
      return node?.status === 'completed' && isMaterial(node)
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
      ...(input.ultra === true ? { ultra: true } : {}),
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

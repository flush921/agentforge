import 'server-only'

import type { z } from 'zod'
import type { AgentStepRequest, StepEvent } from '@/lib/contracts/api'
import type { ToolName, Usage } from '@/lib/contracts/common'
import { parseLlmOutput } from '@/lib/contracts/llm-output'
import type { Lane } from '@/lib/contracts/plan'
import { reviewOutputSchema, type ReviewOutput } from '@/lib/contracts/review'
import {
  ALIGN_PASS_SCORE,
  alignOutputSchema,
  JUDGE_DIMENSIONS,
  judgeOutputSchema,
  type AlignResult,
  type JudgeResult,
} from '@/lib/contracts/ultra'
import { usableTools } from '@/lib/orchestrator/tools'
import { isTie, LANE_LABELS, totalScore } from '@/lib/orchestrator/ultra'
import { toApiError } from '@/server/llm/errors'
import type { LlmClient, LlmJsonRequest } from '@/server/llm/types'
import { retryMessage } from '@/server/prompts/shared'
import { buildReviewPrompt, buildWorkerPrompt } from '@/server/prompts/step'
import { buildAlignFixPrompt, buildAlignPrompt, buildJudgePrompt } from '@/server/prompts/ultra'

const ROUTE = '/api/agent/step'
const zeroUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0 })

/**
 * 单步输出上限（思考 + 正文一起算，按实际用量计费，上限只防失控）。
 * 开思考写最终报告时，实测 5 路里 3 路在 8000 处被截断、报告停在半句；放到 16000 后全部自然结束，
 * 最多用了 13203。
 */
export function workerOutputBudget(thinking: boolean, isFinal: boolean): number {
  if (thinking) return 16000
  return isFinal ? 4000 : 3000
}

async function* runReview(
  llm: LlmClient,
  req: AgentStepRequest,
  signal: AbortSignal,
): AsyncGenerator<StepEvent> {
  const built = buildReviewPrompt(req)
  let messages: LlmJsonRequest['messages'] = [{ role: 'user', content: built.user }]
  const usage = zeroUsage()
  let review: ReviewOutput | undefined

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await llm.generateJson({
      kind: 'review',
      instructions: built.instructions,
      messages,
      temperature: 0,
      maxOutputTokens: 600,
      signal,
    })
    if (signal.aborted) {
      return
    }
    usage.inputTokens += result.usage.inputTokens
    usage.outputTokens += result.usage.outputTokens

    const parsed = parseLlmOutput(reviewOutputSchema, result.text)
    if (parsed.ok) {
      review = parsed.data
      break
    }
    if (attempt === 0) {
      messages = [
        ...messages,
        { role: 'assistant', content: result.text },
        { role: 'user', content: retryMessage([parsed.error]) },
      ]
    }
  }

  const finalReview = review ?? {
    verdict: 'pass' as const,
    issues: [],
    summary: '审校输出无法解析，已按通过处理',
  }
  if (signal.aborted) {
    return
  }
  yield { type: 'text', delta: finalReview.summary }
  if (signal.aborted) {
    return
  }
  yield { type: 'review', verdict: finalReview.verdict, issues: finalReview.issues }
  if (signal.aborted) {
    return
  }
  yield { type: 'done', output: finalReview.summary, usage }
}

export async function* runAgentStep(
  llm: LlmClient,
  req: AgentStepRequest,
  signal: AbortSignal,
): AsyncGenerator<StepEvent> {
  try {
    if (req.node.role === 'reviewer') {
      yield* runReview(llm, req, signal)
      return
    }
    if (req.node.role === 'judge') {
      yield* runJudge(llm, req, signal)
      return
    }
    if (req.node.role === 'aligner') {
      yield* runAlign(llm, req, signal)
      return
    }

    const allowedTools = usableTools(req.assistant.capabilities)
    const tools = req.node.tools.filter((tool) => allowedTools.includes(tool))
    const thinking = !(req.isFinal && req.upstream.length === 0 && tools.length === 0)
    const usage = zeroUsage()
    const output = yield* streamWorker(
      llm,
      buildWorkerPrompt(req, tools),
      { tools, thinking, maxOutputTokens: workerOutputBudget(thinking, req.isFinal) },
      usage,
      signal,
    )
    if (output === undefined) {
      return
    }
    yield* finishWorker(req, output, usage)
  } catch (error) {
    if (signal.aborted) {
      return
    }
    const mapped = toApiError(error, signal, ROUTE)
    yield { type: 'error', error: mapped.error, retryable: mapped.retryable }
  }
}

/** 最终节点的产出末尾追加免责声明，并计入 output。 */
function* finishWorker(req: AgentStepRequest, text: string, usage: Usage): Generator<StepEvent> {
  let output = text
  const disclaimer = req.isFinal ? req.assistant.guardrails.disclaimer : undefined
  if (disclaimer !== undefined) {
    const delta = `\n\n> ⚠️ ${disclaimer}`
    output += delta
    yield { type: 'text', delta }
  }
  yield { type: 'done', output, usage }
}

/**
 * 流式执行一个工作 Agent，转发推理、正文和工具事件，返回最后一个非空 step 的正文。
 * 中途取消时返回 undefined；没有任何正文时抛出 no_output。
 */
async function* streamWorker(
  llm: LlmClient,
  built: { instructions: string; user: string },
  options: { tools: ToolName[]; thinking: boolean; maxOutputTokens: number },
  usage: Usage,
  signal: AbortSignal,
): AsyncGenerator<StepEvent, string | undefined> {
  let currentStepText = ''
  let lastNonEmptyStep: string | undefined
  let startedSteps = 0

  for await (const part of llm.streamAgent({
    instructions: built.instructions,
    messages: [{ role: 'user', content: built.user }],
    tools: options.tools,
    thinking: options.thinking,
    maxOutputTokens: options.maxOutputTokens,
    signal,
  })) {
    if (signal.aborted) {
      return undefined
    }

    switch (part.type) {
      case 'step-start':
        if (startedSteps > 0 && currentStepText.length > 0) {
          lastNonEmptyStep = currentStepText
        }
        startedSteps += 1
        currentStepText = ''
        break
      case 'reasoning':
        yield { type: 'reasoning', delta: part.delta }
        break
      case 'text':
        currentStepText += part.delta
        yield { type: 'text', delta: part.delta }
        break
      case 'tool_call':
        yield {
          type: 'tool_call',
          callId: part.callId,
          tool: part.tool,
          input: part.input,
        }
        break
      case 'tool_result':
        yield {
          type: 'tool_result',
          callId: part.callId,
          ok: part.ok,
          summary: part.summary,
        }
        break
      case 'finish':
        usage.inputTokens += part.usage.inputTokens
        usage.outputTokens += part.usage.outputTokens
        break
    }
  }

  if (signal.aborted) {
    return undefined
  }
  if (currentStepText.length > 0) {
    lastNonEmptyStep = currentStepText
  }
  const output = lastNonEmptyStep === undefined ? '' : stripToolMarkup(lastNonEmptyStep)
  if (output.length === 0) {
    throw new Error('no_output')
  }
  return output
}

/**
 * 兜底：去掉模型误写进正文的工具调用内部标记（DeepSeek 的 DSML 标签）。
 * 最后一步已经不带工具定义，正常不会出现；只剩标记时按无输出处理，交给编排器重试。
 */
export function stripToolMarkup(text: string): string {
  if (!text.includes('DSML')) {
    return text
  }
  return text
    .split('\n')
    .filter((line) => !line.includes('DSML'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 调用一次 JSON 模型并按 schema 解析，不合法时回喂错误重试一次；两次都失败返回 undefined。 */
async function generateParsed<T>(
  llm: LlmClient,
  kind: LlmJsonRequest['kind'],
  built: { instructions: string; user: string },
  schema: z.ZodType<T>,
  usage: Usage,
  signal: AbortSignal,
): Promise<T | undefined> {
  let messages: LlmJsonRequest['messages'] = [{ role: 'user', content: built.user }]
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await llm.generateJson({
      kind,
      instructions: built.instructions,
      messages,
      temperature: 0,
      maxOutputTokens: 600,
      signal,
    })
    if (signal.aborted) {
      return undefined
    }
    usage.inputTokens += result.usage.inputTokens
    usage.outputTokens += result.usage.outputTokens

    const parsed = parseLlmOutput(schema, result.text)
    if (parsed.ok) {
      return parsed.data
    }
    messages = [
      ...messages,
      { role: 'assistant', content: result.text },
      { role: 'user', content: retryMessage([parsed.error]) },
    ]
  }
  return undefined
}

/**
 * 第一层审阅：多路择优。各路成果匿名编号后，同时发起两次评审：一次按取向顺序，一次倒序，
 * 每一路的两次分数和名次分别取平均，抵消模型偏向排在前面的方案。
 * 采用哪一路由代码决定：先比平均总分，并列时比平均名次，仍并列则取排在前面的取向。
 */
async function* runJudge(
  llm: LlmClient,
  req: AgentStepRequest,
  signal: AbortSignal,
): AsyncGenerator<StepEvent> {
  const lanes = (req.ultra?.lanes ?? []).flatMap((item) => {
    const output = req.upstream.find((upstream) => upstream.nodeId === item.nodeId)?.output
    return output === undefined ? [] : [{ lane: item.lane, output }]
  })
  const usage = zeroUsage()
  const schema = judgeOutputSchema(lanes.length)
  const orders = [lanes, [...lanes].reverse()]
  const settled = await Promise.allSettled(
    orders.map((order) =>
      generateParsed(
        llm,
        'judge',
        buildJudgePrompt(
          req,
          order.map((item) => item.output),
        ),
        schema,
        usage,
        signal,
      ),
    ),
  )
  if (signal.aborted) {
    return
  }
  // 一次调用出错时用另一次的结果；两次都出错才算本节点失败，交给编排器重试。
  if (settled.every((item) => item.status === 'rejected')) {
    throw (settled[0] as PromiseRejectedResult).reason
  }

  const votes = settled.flatMap((item, index) => {
    const output = item.status === 'fulfilled' ? item.value : undefined
    const order = orders[index]
    if (output === undefined || order === undefined) {
      return []
    }
    // ranking 里是这次呈现顺序下的方案编号，换算成各取向的名次（1 为最好）。
    const ranks = new Map<Lane, number>()
    output.ranking.forEach((no, index) => {
      const lane = order[no - 1]?.lane
      if (lane !== undefined) ranks.set(lane, index + 1)
    })
    return [
      {
        scores: new Map(
          order.map((entry, position) => [entry.lane, output.scores[position] ?? []]),
        ),
        ranks,
        top: order[(output.ranking[0] ?? 1) - 1]?.lane,
        reason: output.reason,
      },
    ]
  })

  let result: JudgeResult
  const firstLane = lanes[0]?.lane ?? 'rigor'
  if (votes.length === 0) {
    result = {
      winner: firstLane,
      reason: `评审输出无法解析，默认采用「${LANE_LABELS[firstLane]}」一路`,
      walkover: true,
    }
  } else {
    const scores = lanes.map(({ lane }) => {
      const sets = votes.map((vote) => vote.scores.get(lane) ?? [])
      const ranks = votes.map((vote) => vote.ranks.get(lane) ?? lanes.length)
      return {
        lane,
        scores: JUDGE_DIMENSIONS.map(
          (_, dimension) => sets.reduce((sum, set) => sum + (set[dimension] ?? 0), 0) / sets.length,
        ),
        rank: ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length,
      }
    })
    // 按总分降序、平均名次升序挑第一；两者都相同时 reduce 保留排在前面的取向。
    const winner = scores.reduce((best, item) => {
      const diff = totalScore(item.scores) - totalScore(best.scores)
      return diff > 0 || (diff === 0 && item.rank < best.rank) ? item : best
    }).lane
    const reason = (votes.find((vote) => vote.top === winner) ?? votes[0]!).reason
    result = { winner, scores, reason }
  }

  const summary = `采用「${LANE_LABELS[result.winner]}」一路${tieNote(result)}：${result.reason}`
  yield { type: 'text', delta: summary }
  if (signal.aborted) {
    return
  }
  yield { type: 'judge', result }
  if (signal.aborted) {
    return
  }
  yield { type: 'done', output: summary, usage }
}

/** 总分并列时说明是怎么定下来的：排名分出了先后，还是连排名也分不开、只能按取向顺序。 */
function tieNote(result: JudgeResult): string {
  const scores = result.scores
  if (scores === undefined || !isTie(scores)) {
    return ''
  }
  const best = Math.max(...scores.map((item) => totalScore(item.scores)))
  const leaders = scores.filter((item) => totalScore(item.scores) === best)
  const ranks = new Set(leaders.map((item) => item.rank))
  return ranks.size > 1 ? '（总分并列，按评审排名）' : '（总分并列，评审也无法区分，按取向顺序）'
}

function stripDisclaimer(req: AgentStepRequest, text: string): string {
  const disclaimer = req.assistant.guardrails.disclaimer
  const suffix = `\n\n> ⚠️ ${disclaimer ?? ''}`
  return disclaimer !== undefined && text.endsWith(suffix) ? text.slice(0, -suffix.length) : text
}

/**
 * 第二层审阅：对照整体策略检查择优选中的成果。
 * 分数达标时沿用这份成果（完整原文由编排器补上）；偏离时由校准员按纠偏意见当场重写。
 */
async function* runAlign(
  llm: LlmClient,
  req: AgentStepRequest,
  signal: AbortSignal,
): AsyncGenerator<StepEvent> {
  const usage = zeroUsage()
  const material = req.upstream[0]?.output ?? ''
  const parsed = await generateParsed(
    llm,
    'align',
    buildAlignPrompt(req),
    alignOutputSchema,
    usage,
    signal,
  )
  if (signal.aborted) {
    return
  }
  const result: AlignResult =
    parsed === undefined
      ? {
          score: ALIGN_PASS_SCORE,
          drift: [],
          summary: '校准输出无法解析，已沿用择优结果',
          aligned: true,
        }
      : { ...parsed, aligned: parsed.score >= ALIGN_PASS_SCORE || parsed.drift.length === 0 }

  yield { type: 'align', result }
  if (signal.aborted) {
    return
  }
  if (result.aligned) {
    yield { type: 'text', delta: result.summary }
    yield { type: 'done', output: material, usage }
    return
  }

  const output = yield* streamWorker(
    llm,
    buildAlignFixPrompt(req, stripDisclaimer(req, material), result.drift),
    { tools: [], thinking: false, maxOutputTokens: workerOutputBudget(false, req.isFinal) },
    usage,
    signal,
  )
  if (output === undefined) {
    return
  }
  yield* finishWorker(req, output, usage)
}

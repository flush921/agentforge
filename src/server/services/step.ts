import 'server-only'

import type { AgentStepRequest, StepEvent } from '@/lib/contracts/api'
import type { Usage } from '@/lib/contracts/common'
import { parseLlmOutput } from '@/lib/contracts/llm-output'
import { reviewOutputSchema, type ReviewOutput } from '@/lib/contracts/review'
import { usableTools } from '@/lib/orchestrator/tools'
import { toApiError } from '@/server/llm/errors'
import type { LlmClient, LlmJsonRequest } from '@/server/llm/types'
import { retryMessage } from '@/server/prompts/shared'
import { buildReviewPrompt, buildWorkerPrompt } from '@/server/prompts/step'

const ROUTE = '/api/agent/step'
const zeroUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0 })

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

    const allowedTools = usableTools(req.assistant.capabilities)
    const tools = req.node.tools.filter((tool) => allowedTools.includes(tool))
    const thinking = !(req.isFinal && req.upstream.length === 0 && tools.length === 0)
    const built = buildWorkerPrompt(req, tools)
    const usage = zeroUsage()
    let currentStepText = ''
    let lastNonEmptyStep: string | undefined
    let startedSteps = 0

    for await (const part of llm.streamAgent({
      instructions: built.instructions,
      messages: [{ role: 'user', content: built.user }],
      tools,
      thinking,
      maxOutputTokens: req.isFinal ? 6000 : 3000,
      signal,
    })) {
      if (signal.aborted) {
        return
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
          usage.inputTokens = part.usage.inputTokens
          usage.outputTokens = part.usage.outputTokens
          break
      }
    }

    if (signal.aborted) {
      return
    }
    if (currentStepText.length > 0) {
      lastNonEmptyStep = currentStepText
    }
    if (lastNonEmptyStep === undefined) {
      throw new Error('no_output')
    }

    let output = lastNonEmptyStep
    const disclaimer = req.isFinal ? req.assistant.guardrails.disclaimer : undefined
    if (disclaimer !== undefined) {
      const delta = `\n\n> ⚠️ ${disclaimer}`
      output += delta
      yield { type: 'text', delta }
    }
    yield { type: 'done', output, usage }
  } catch (error) {
    if (signal.aborted) {
      return
    }
    const mapped = toApiError(error, signal, ROUTE)
    yield { type: 'error', error: mapped.error, retryable: mapped.retryable }
  }
}

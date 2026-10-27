import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AssistantSpec } from '@/lib/contracts/assistant'
import type { Usage } from '@/lib/contracts/common'
import { PRESET_ASSISTANTS } from '@/lib/fixtures/preset-assistants'
import { decideLevel } from '@/lib/orchestrator/level'
import { usableTools } from '@/lib/orchestrator/tools'
import { parseEvalConfig } from '@/eval/eval-config'
import { readHistoricalCosts } from '@/eval/historical-cost-io'
import { GUARD_CASES, ROUTE_CASES, type EvalPresetId } from '@/eval/route-dataset'
import { ROUTE_HOLDOUT } from '@/eval/route-holdout'
import {
  buildRouteReport,
  type AssessmentRound,
  type GuardEvalResult,
  type RouteEvalResult,
  type RouteEvaluationArtifact,
} from '@/eval/route-eval-report'
import { getLlm } from '@/server/llm'
import type { LlmClient } from '@/server/llm/types'
import { assessTask } from '@/server/services/assess'

const config = parseEvalConfig(process.env)
const reportDir = path.resolve(process.cwd(), '../collab/reports/eval/T15', config.tag)
const describeLive = process.env.LLM_MODE === 'live' ? describe : describe.skip

interface EvaluationJob {
  result: { id: string; task: string; rounds: AssessmentRound[] }
  preset: AssistantSpec
  round: 1 | 2
}

function assertSafeText(text: string): void {
  for (const variable of ['LLM_API_KEY', 'LLM_BASE_URL', 'ACCESS_CODE'] as const) {
    const value = process.env[variable]
    if (value && text.includes(value)) {
      throw new Error(`检测到 ${variable} 泄漏风险，已拒绝写入或输出`)
    }
  }
}

function presetFor(presetId: EvalPresetId): AssistantSpec {
  const preset = PRESET_ASSISTANTS.find((item) => item.id === presetId)
  if (preset === undefined) throw new Error(`缺少评测 preset：${presetId}`)
  return preset
}

function prepareJobs() {
  const routeCases = config.set === 'holdout' ? ROUTE_HOLDOUT : ROUTE_CASES
  const routes: RouteEvalResult[] = routeCases.map((item) => ({ ...item, rounds: [] }))
  const guards: GuardEvalResult[] = config.guard
    ? GUARD_CASES.map((item) => ({ ...item, rounds: [] }))
    : []
  const jobs: EvaluationJob[] = []
  for (const result of routes) {
    const preset = presetFor(result.presetId)
    jobs.push({ result, preset, round: 1 }, { result, preset, round: 2 })
  }
  for (const result of guards) {
    jobs.push({ result, preset: presetFor(result.presetId), round: 1 })
  }
  return { routes, guards, jobs }
}

describeLive(`T15 路由真实评测 ${config.tag}`, () => {
  it(`串行完成 ${config.set} 路由预测${config.guard ? '和护栏评估' : ''}`, async () => {
    const { routes, guards, jobs } = prepareJobs()
    expect(jobs).toHaveLength(config.guard ? 68 : 60)
    const costSamples = await readHistoricalCosts()
    await mkdir(reportDir, { recursive: true })
    const llm = getLlm()
    if (llm.mode !== 'live') throw new Error('eval:route 需要 LLM_MODE=live，未发起评测')

    let assessmentCalls = 0
    const startedAt = new Date().toISOString()
    for (const job of jobs) {
      const usage: Usage = { inputTokens: 0, outputTokens: 0 }
      let llmCalls = 0
      const measuredLlm: LlmClient = {
        mode: llm.mode,
        async generateJson(request) {
          llmCalls += 1
          const result = await llm.generateJson(request)
          usage.inputTokens += result.usage.inputTokens
          usage.outputTokens += result.usage.outputTokens
          return result
        },
        streamAgent: (request) => llm.streamAgent(request),
      }
      const started = performance.now()
      assessmentCalls += 1
      const result = await assessTask(
        measuredLlm,
        job.preset,
        job.result.task,
        new AbortController().signal,
      )
      if (!result.ok) {
        throw new Error(`评估服务未返回结果：${job.result.id} 第${job.round}轮`)
      }
      const assessment = result.value
      const decision = decideLevel(
        assessment.dims,
        0.5,
        usableTools(job.preset.capabilities).length > 0,
      )
      job.result.rounds.push({
        round: job.round,
        dims: assessment.dims,
        rationale: assessment.rationale,
        source: assessment.source,
        level: decision.level,
        decision,
        guard: assessment.guard ?? null,
        durationMs: Math.round(performance.now() - started),
        usage,
        llmCalls,
      })
      console.log(
        `${job.result.id} 第${job.round}轮：L${decision.level}，${assessment.source}，${Math.round(performance.now() - started)}ms`,
      )
    }

    const artifact: RouteEvaluationArtifact = {
      intensity: 0.5,
      assessmentCalls,
      llmCalls: [...routes, ...guards].reduce(
        (sum, item) => sum + item.rounds.reduce((count, round) => count + round.llmCalls, 0),
        0,
      ),
      startedAt,
      completedAt: new Date().toISOString(),
      evalSet: config.set,
      evalTag: config.tag,
      routes,
      guards,
      costSamples,
    }
    expect(artifact.assessmentCalls).toBe(config.guard ? 68 : 60)
    expect(routes.every((item) => item.rounds.length === 2)).toBe(true)
    expect(guards.every((item) => item.rounds.length === 1)).toBe(true)

    const rawJson = `${JSON.stringify(artifact, null, 2)}\n`
    const report = buildRouteReport(artifact)
    assertSafeText(rawJson)
    assertSafeText(report)
    await Promise.all([
      writeFile(path.join(reportDir, 'raw.json'), rawJson, 'utf8'),
      writeFile(path.join(reportDir, 'report.md'), report, 'utf8'),
    ])
    console.log(`已完成 ${assessmentCalls} 次评估，报告写入 collab/reports/eval/T15/${config.tag}/`)
  })
})

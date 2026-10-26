import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { POST as agentStep } from '@/app/api/agent/step/route'
import { POST as assess } from '@/app/api/orchestrate/assess/route'
import { POST as plan } from '@/app/api/orchestrate/plan/route'
import { assistantDraftSchema } from '@/lib/contracts/assistant'
import type { Usage } from '@/lib/contracts/common'
import type { RunEvent } from '@/lib/contracts/events'
import { PRESET_ASSISTANTS } from '@/lib/fixtures/preset-assistants'
import { createHttpDeps } from '@/lib/orchestrator/http-deps'
import { runOrchestration } from '@/lib/orchestrator/run'
import { getLlm } from '@/server/llm'
import type { LlmClient } from '@/server/llm/types'
import { generateAssistant } from '@/server/services/generate'

const reportDir = path.resolve(process.cwd(), '../collab/reports/live/T11')
const describeLive = process.env.LLM_MODE === 'live' ? describe : describe.skip
const summaryRows: string[] = []
const diagnosticLines: string[] = []
let generateInfo: { name: string; durationMs: number; usage: Usage } | undefined

const fetchImpl: typeof fetch = async (input, init) => {
  const url = new URL(String(input))
  const request = new Request(url, init)
  switch (url.pathname) {
    case '/api/orchestrate/assess':
      return assess(request)
    case '/api/orchestrate/plan':
      return plan(request)
    case '/api/agent/step':
      return agentStep(request)
    default:
      throw new Error(`未注册的真实联调路由：${url.pathname}`)
  }
}

function assertSafeText(text: string): void {
  for (const variable of ['LLM_API_KEY', 'LLM_BASE_URL'] as const) {
    const value = process.env[variable]
    if (value && text.includes(value)) {
      throw new Error(`检测到 ${variable} 泄漏风险，已拒绝写入或输出`)
    }
  }
}

function cell(value: unknown): string {
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\|/g, '\\|')
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown'
}

describeLive('T11 真实模型冒烟', () => {
  beforeAll(async () => {
    await mkdir(reportDir, { recursive: true })
    const llm = getLlm()
    const usage: Usage = { inputTokens: 0, outputTokens: 0 }
    const measuredLlm: LlmClient = {
      mode: llm.mode,
      async generateJson(request) {
        const result = await llm.generateJson(request)
        usage.inputTokens += result.usage.inputTokens
        usage.outputTokens += result.usage.outputTokens
        return result
      },
      streamAgent: (request) => llm.streamAgent(request),
    }
    const startedAt = performance.now()
    const result = await generateAssistant(
      measuredLlm,
      '帮我做一个考研择校顾问',
      new AbortController().signal,
    )
    const durationMs = Math.round(performance.now() - startedAt)

    if (!result.ok) {
      throw new Error(`真实 generate 失败（${errorName(result.error)}）`)
    }
    const draft = assistantDraftSchema.parse(result.value)
    generateInfo = { name: draft.name, durationMs, usage }
    console.log(
      `generate：${durationMs}ms，input=${usage.inputTokens}，output=${usage.outputTokens}，schema=pass`,
    )
  })

  for (const preset of PRESET_ASSISTANTS) {
    for (const [index, starter] of preset.starters.entries()) {
      it(`${preset.id} starter ${index + 1}`, async () => {
        const filename = `${preset.id}-${index + 1}.json`
        const events: RunEvent[] = []
        const deps = createHttpDeps({ baseUrl: 'http://live.test', fetchImpl })
        let relayRetries = 0
        const errorSpy = vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
          if (typeof message !== 'string') return
          if (message.includes('上游临时拒绝')) relayRetries += 1
          if (message.startsWith('[api]')) diagnosticLines.push(`${filename} ${message}`)
        })
        const state = await (async () => {
          try {
            return await runOrchestration(
              { assistant: preset, task: starter, intensity: preset.defaultIntensity },
              deps,
              (event) => events.push(event),
              new AbortController().signal,
            )
          } finally {
            errorSpy.mockRestore()
          }
        })()
        const serialized = JSON.stringify(events, null, 2)
        assertSafeText(serialized)
        await writeFile(path.join(reportDir, filename), serialized, 'utf8')

        const retriedNodes = new Set<string>()
        for (const event of events) {
          if (event.type === 'node.started' && event.attempt === 2) {
            retriedNodes.add(event.nodeId)
          }
        }
        const errors = [
          ...(state.error ? [state.error] : []),
          ...Object.values(state.nodes).flatMap((node) => (node.error ? [node.error] : [])),
        ]
        const internalErrors = errors.filter((error) => error.code === 'internal')
        const dynamicCount = Object.values(state.nodes).filter((node) => node.dynamic).length
        const dimensions = state.assessment
          ? `${JSON.stringify(state.assessment.dims)} / ${state.assessment.source}`
          : '—'
        const output = state.output?.trim().slice(0, 120) || '—'
        const errorText =
          [...new Set(errors.map((error) => `${error.code}: ${error.message}`))].join('；') || '—'
        summaryRows.push(
          `| ${[
            preset.id,
            index + 1,
            dimensions,
            state.level ?? '—',
            state.planSource ?? '—',
            state.planFailures.length,
            relayRetries,
            retriedNodes.size,
            `${state.nodeOrder.length} (+${dynamicCount})`,
            state.degraded ? '是' : '否',
            state.warnings.join('；') || '—',
            state.status,
            state.durationMs ?? state.lastT,
            `${state.usage.inputTokens} / ${state.usage.outputTokens}`,
            output,
            errorText,
          ]
            .map(cell)
            .join(' | ')} |`,
        )
        console.log(
          `${filename}：${state.status}，L${state.level ?? '—'}，nodes=${state.nodeOrder.length}，relay=${relayRetries}，nodeRetry=${retriedNodes.size}`,
        )

        expect(['completed', 'failed', 'cancelled']).toContain(state.status)
        if (state.status === 'completed') {
          expect(state.output?.trim()).not.toBe('')
        }
        expect(internalErrors).toEqual([])
      })
    }
  }

  afterAll(async () => {
    const generateLine = generateInfo
      ? `generate：${generateInfo.name}；${generateInfo.durationMs}ms；input=${generateInfo.usage.inputTokens}；output=${generateInfo.usage.outputTokens}；schema=pass`
      : 'generate：未完成'
    const summary = [
      '# T11 真实模型冒烟汇总',
      '',
      `- ${generateLine}`,
      '- 全链路：3 个示例 Agent × 4 条 starter，共 12 次，串行执行。',
      '',
      '| Agent | # | 评估维度 / 来源 | L | plan.source | attempts | relay 重试次数 | 节点重试 | nodes (+dynamic) | degraded | warnings | 终态 | ms | usage in/out | output 前 120 字 | error |',
      '| :-- | --: | :-- | --: | :-- | --: | --: | --: | --: | :-- | :-- | :-- | --: | --: | :-- | :-- |',
      ...summaryRows,
      '',
    ].join('\n')
    assertSafeText(summary)
    await writeFile(path.join(reportDir, 'summary.md'), summary, 'utf8')
    if (diagnosticLines.length > 0) {
      const diagnostics = `${diagnosticLines.join('\n')}\n`
      assertSafeText(diagnostics)
      await writeFile(path.join(reportDir, 'diagnostics.log'), diagnostics, 'utf8')
    }
    console.log(`\n${summary}`)
  })
})

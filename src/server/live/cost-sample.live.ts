import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { POST as agentStep } from '@/app/api/agent/step/route'
import { POST as assess } from '@/app/api/orchestrate/assess/route'
import { POST as plan } from '@/app/api/orchestrate/plan/route'
import type { Level } from '@/lib/contracts/common'
import type { RunEvent } from '@/lib/contracts/events'
import { PRESET_ASSISTANTS } from '@/lib/fixtures/preset-assistants'
import { createHttpDeps } from '@/lib/orchestrator/http-deps'
import { runOrchestration } from '@/lib/orchestrator/run'
import { parseT11CostEvents } from '@/eval/historical-cost'
import { readHistoricalCosts } from '@/eval/historical-cost-io'
import type { RouteEvaluationArtifact } from '@/eval/route-eval-report'
import { buildCostReport, buildT15Summary, type CostRunSummary } from '@/eval/t15-summary'
import { getLlm } from '@/server/llm'

const reportDir = path.resolve(process.cwd(), '../collab/reports/live/T15')
const evalDir = path.resolve(process.cwd(), '../collab/reports/eval')
const describeLive = process.env.LLM_MODE === 'live' ? describe : describe.skip

const COST_TASKS = [
  {
    id: 'cost-1',
    task: '上月销售额 86 万，本月 103 万，环比增长率是多少？',
    expected: 1,
  },
  { id: 'cost-2', task: '成本 45 元、售价 78 元，毛利率是多少？', expected: 1 },
  {
    id: 'cost-3',
    task: '今年四个季度销售额分别是 120、135、128、160 万，季度平均值是多少？',
    expected: 1,
  },
  { id: 'cost-4', task: '中位数和平均数有什么区别？', expected: 0 },
] as const satisfies ReadonlyArray<{ id: string; task: string; expected: Level }>

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
      throw new Error(`未注册的成本采样路由：${url.pathname}`)
  }
}

function assertSafeText(text: string): void {
  for (const variable of ['LLM_API_KEY', 'LLM_BASE_URL', 'ACCESS_CODE'] as const) {
    const value = process.env[variable]
    if (value && text.includes(value)) {
      throw new Error(`检测到 ${variable} 泄漏风险，已拒绝写入或输出`)
    }
  }
}

async function readArtifact(relativePath: string): Promise<RouteEvaluationArtifact> {
  return JSON.parse(
    await readFile(path.join(evalDir, relativePath), 'utf8'),
  ) as RouteEvaluationArtifact
}

describeLive('T15 成本采样', () => {
  it('串行执行四次编排并按实际 level 生成成本与汇总报告', async () => {
    const [baseline, holdout, dev, reference] = await Promise.all([
      readArtifact('T15/holdout-v12/raw.json'),
      readArtifact('T15/holdout-v13/raw.json'),
      readArtifact('T15/dev-v13/raw.json'),
      readArtifact('T14/raw.json'),
    ])
    await mkdir(reportDir, { recursive: true })
    const llm = getLlm()
    if (llm.mode !== 'live') throw new Error('eval:cost 需要 LLM_MODE=live，未发起编排')
    const assistant = PRESET_ASSISTANTS.find((item) => item.id === 'preset-data')
    if (assistant === undefined) throw new Error('缺少 preset-data')

    const runs: CostRunSummary[] = []
    for (const item of COST_TASKS) {
      const events: RunEvent[] = []
      const deps = createHttpDeps({ baseUrl: 'http://live.test', fetchImpl })
      const state = await runOrchestration(
        { assistant, task: item.task, intensity: assistant.defaultIntensity },
        deps,
        (event) => events.push(event),
        new AbortController().signal,
      )
      const serialized = `${JSON.stringify(events, null, 2)}\n`
      assertSafeText(serialized)
      await writeFile(path.join(reportDir, `${item.id}.json`), serialized, 'utf8')

      const sample = state.status === 'completed' ? parseT11CostEvents(events) : null
      runs.push({
        id: item.id,
        task: item.task,
        expected: item.expected,
        status: state.status,
        level: sample?.level ?? null,
        totalTokens: sample?.totalTokens ?? null,
        durationMs: sample?.durationMs ?? null,
      })
      console.log(
        `${item.id}：${state.status}，实际 L${sample?.level ?? '—'}，期望 L${item.expected}`,
      )
    }
    expect(runs).toHaveLength(4)

    const samples = await readHistoricalCosts(['T11', 'T13', 'T15'])
    expect(samples.filter((sample) => sample.source === 'T15')).toHaveLength(
      runs.filter((run) => run.status === 'completed').length,
    )
    const costReport = buildCostReport(holdout, samples, runs)
    const summary = buildT15Summary({ baseline, holdout, dev, reference, samples })
    assertSafeText(costReport)
    assertSafeText(summary)
    const outputDir = path.join(evalDir, 'T15')
    await Promise.all([
      writeFile(path.join(outputDir, 'cost.md'), costReport, 'utf8'),
      writeFile(path.join(outputDir, 'summary.md'), summary, 'utf8'),
    ])
    const l1Count = runs.filter((run) => run.level === 1).length
    console.log(`4 次编排已结束，L1=${l1Count}；不追加运行。`)
    console.log('已生成 collab/reports/eval/T15/cost.md 和 summary.md')
  })
})

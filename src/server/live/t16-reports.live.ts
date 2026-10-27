import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'vitest'
import { readHistoricalCosts } from '@/eval/historical-cost-io'
import { buildRouteReport, type RouteEvaluationArtifact } from '@/eval/route-eval-report'
import { buildT16Final } from '@/eval/t16-final'
import { buildOfflineRecompute } from '@/eval/t16-offline'

const evalDir = path.resolve(process.cwd(), '../collab/reports/eval')
const outputDir = path.join(evalDir, 'T16')
const mode = process.env.REPORT_MODE
if (mode !== 'offline' && mode !== 'final') {
  throw new Error('REPORT_MODE 必须是 offline 或 final')
}

async function readArtifact(relativePath: string): Promise<RouteEvaluationArtifact> {
  return JSON.parse(
    await readFile(path.join(evalDir, relativePath), 'utf8'),
  ) as RouteEvaluationArtifact
}

function assertSafeText(text: string): void {
  for (const variable of ['LLM_API_KEY', 'LLM_BASE_URL', 'ACCESS_CODE'] as const) {
    const value = process.env[variable]
    if (value && text.includes(value)) {
      throw new Error(`检测到 ${variable} 泄漏风险，已拒绝写入或输出`)
    }
  }
}

describe('T16 离线报告', () => {
  it(`${mode}：只读取已保存的数据，不调用模型`, async () => {
    await mkdir(outputDir, { recursive: true })
    if (mode === 'offline') {
      const [t14Dev, holdoutV12, holdoutV13, devV13] = await Promise.all([
        readArtifact('T14/raw.json'),
        readArtifact('T15/holdout-v12/raw.json'),
        readArtifact('T15/holdout-v13/raw.json'),
        readArtifact('T15/dev-v13/raw.json'),
      ])
      const report = buildOfflineRecompute([
        { label: 'T14 dev-v12', raw: t14Dev },
        { label: 'T15 holdout-v12', raw: holdoutV12 },
        { label: 'T15 holdout-v13', raw: holdoutV13 },
        { label: 'T15 dev-v13', raw: devV13 },
      ])
      assertSafeText(report)
      await writeFile(path.join(outputDir, 'offline-recompute.md'), report, 'utf8')
      console.log('已离线生成 collab/reports/eval/T16/offline-recompute.md，未调用模型')
      return
    }

    const [final, t14Dev, holdoutV12, holdoutV13] = await Promise.all([
      readArtifact('T16/holdout2-final/raw.json'),
      readArtifact('T14/raw.json'),
      readArtifact('T15/holdout-v12/raw.json'),
      readArtifact('T15/holdout-v13/raw.json'),
    ])
    const samples = await readHistoricalCosts(['T11', 'T13', 'T15'])
    const report = buildT16Final({ final, t14Dev, holdoutV12, holdoutV13, samples })
    const routeReport = buildRouteReport(final)
    assertSafeText(report)
    assertSafeText(routeReport)
    await Promise.all([
      writeFile(path.join(outputDir, 'final.md'), report, 'utf8'),
      writeFile(path.join(outputDir, 'holdout2-final/report.md'), routeReport, 'utf8'),
    ])
    console.log(
      '已离线生成 collab/reports/eval/T16/final.md 和 holdout2-final/report.md，未调用模型',
    )
  })
})

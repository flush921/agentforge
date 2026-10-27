import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  parseT11CostEvents,
  parseT13CostResults,
  type HistoricalCostSample,
} from './historical-cost'

const historicalDir = path.resolve(process.cwd(), '../collab/reports/live')

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown
}

function isCompletedEvents(input: unknown): boolean {
  if (!Array.isArray(input)) return false
  const last: unknown = input.at(-1)
  return (
    typeof last === 'object' && last !== null && 'type' in last && last.type === 'run.completed'
  )
}

async function readEventSamples(source: 'T11' | 'T15'): Promise<HistoricalCostSample[]> {
  const directory = path.join(historicalDir, source)
  const filenames = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort()
  const samples: HistoricalCostSample[] = []
  for (const filename of filenames) {
    const input = await readJson(path.join(directory, filename))
    if (!isCompletedEvents(input)) continue
    const sample = parseT11CostEvents(input)
    samples.push({ source, id: filename.replace(/\.json$/, ''), ...sample })
  }
  return samples
}

export async function readHistoricalCosts(
  sources: Array<HistoricalCostSample['source']> = ['T11', 'T13'],
): Promise<HistoricalCostSample[]> {
  const samples: HistoricalCostSample[] = []
  for (const source of sources) {
    if (source === 'T13') {
      const results = parseT13CostResults(
        await readJson(path.join(historicalDir, 'T13/results.json')),
      )
      for (const sample of results) samples.push({ source, ...sample })
    } else {
      samples.push(...(await readEventSamples(source)))
    }
  }
  return samples
}

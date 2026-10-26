import { z } from 'zod'
import { levelSchema, usageSchema, type Level } from '../lib/contracts/common'
import type { LevelCostStatsMap } from './metrics'

export interface LevelCostSample {
  level: Level
  totalTokens: number
  durationMs: number
}

export interface HistoricalCostSample extends LevelCostSample {
  source: 'T11' | 'T13'
  id: string
}

const eventSchema = z.looseObject({ type: z.string() })
const planCompletedSchema = z.looseObject({
  type: z.literal('plan.completed'),
  plan: z.looseObject({ level: levelSchema }),
})
const runCompletedSchema = z.looseObject({
  type: z.literal('run.completed'),
  usage: usageSchema,
  durationMs: z.number().finite().nonnegative(),
})
const t13ResultSchema = z.looseObject({
  id: z.string().min(1),
  status: z.literal('completed'),
  level: levelSchema,
  usage: usageSchema,
  durationMs: z.number().finite().nonnegative(),
})

export function parseT11CostEvents(input: unknown): LevelCostSample {
  const events = z.array(eventSchema).parse(input)
  if (events.at(-1)?.type !== 'run.completed') {
    throw new Error('T11 运行不是 completed')
  }
  const completed = runCompletedSchema.parse(events.at(-1))
  const planEvent = events.filter((event) => event.type === 'plan.completed').at(-1)
  if (planEvent === undefined) throw new Error('T11 completed 运行缺少最终 plan')
  const plan = planCompletedSchema.parse(planEvent)
  return {
    level: plan.plan.level,
    totalTokens: completed.usage.inputTokens + completed.usage.outputTokens,
    durationMs: completed.durationMs,
  }
}

export function parseT13CostResults(input: unknown): Array<LevelCostSample & { id: string }> {
  const results = z.array(z.looseObject({ status: z.string() })).parse(input)
  return results
    .filter((result) => result.status === 'completed')
    .map((result) => {
      const completed = t13ResultSchema.parse(result)
      return {
        id: completed.id,
        level: completed.level,
        totalTokens: completed.usage.inputTokens + completed.usage.outputTokens,
        durationMs: completed.durationMs,
      }
    })
}

export function summarizeLevelCosts(samples: LevelCostSample[]): LevelCostStatsMap {
  const stats: LevelCostStatsMap = {}
  for (const level of [0, 1, 2, 3, 4] as const) {
    const matching = samples.filter((sample) => sample.level === level)
    if (matching.length === 0) continue
    stats[level] = {
      n: matching.length,
      averageTokens:
        matching.reduce((sum, sample) => sum + sample.totalTokens, 0) / matching.length,
      averageDurationMs:
        matching.reduce((sum, sample) => sum + sample.durationMs, 0) / matching.length,
    }
  }
  return stats
}

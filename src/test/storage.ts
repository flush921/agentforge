import type { AssistantSpec } from '@/lib/contracts/assistant'
import type { RunRecord } from '@/lib/contracts/run-record'
import { testAssistant } from './fixtures'

export function makeAssistant(id: string, createdAt = '2026-10-26T00:00:00.000Z'): AssistantSpec {
  return { ...testAssistant, id, createdAt }
}

export function makeRun(
  runId: string,
  assistantId: string,
  createdAt = '2026-10-26T00:00:00.000Z',
): RunRecord {
  return {
    runId,
    assistantId,
    task: '整理一份学习计划',
    createdAt,
    status: 'completed',
    level: 0,
    usage: { inputTokens: 10, outputTokens: 20 },
    durationMs: 100,
    events: [],
  }
}

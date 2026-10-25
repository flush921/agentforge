import { describe, expect, it } from 'vitest'
import { runRecordSchema, runStatusSchema } from './run-record'

const validRecord = {
  runId: 'run-1',
  assistantId: 'assistant-1',
  task: '你好',
  createdAt: '2026-10-26T00:00:00.000Z',
  status: 'completed',
  level: 0,
  usage: { inputTokens: 1, outputTokens: 1 },
  durationMs: 100,
  events: [],
}

describe('runRecordSchema', () => {
  it('接受合法记录', () => {
    expect(runRecordSchema.safeParse(validRecord).success).toBe(true)
  })

  it.each([
    { ...validRecord, status: 'other' },
    { ...validRecord, extra: true },
    { ...validRecord, durationMs: -1 },
    { ...validRecord, createdAt: 'invalid' },
  ])('拒绝非法记录 %#', (record) => {
    expect(runRecordSchema.safeParse(record).success).toBe(false)
  })

  it.each(['idle', 'assessing', 'planning', 'running', 'completed', 'failed', 'cancelled'])(
    'runStatusSchema 接受 %s',
    (status) => {
      expect(runStatusSchema.safeParse(status).success).toBe(true)
    },
  )
})

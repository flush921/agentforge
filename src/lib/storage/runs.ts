import { runRecordSchema, type RunRecord } from '../contracts/run-record'
import { openAgentForgeDB } from './db'

function readRun(value: unknown): RunRecord | undefined {
  const parsed = runRecordSchema.safeParse(value)
  if (parsed.success) return parsed.data
  const id =
    typeof value === 'object' && value !== null && 'runId' in value ? value.runId : undefined
  console.warn('[storage] 跳过无效记录', typeof id === 'string' ? id : 'unknown')
  return undefined
}

export async function listRuns({
  assistantId,
  limit = 50,
}: { assistantId?: string; limit?: number } = {}): Promise<RunRecord[]> {
  const db = await openAgentForgeDB()
  if (limit <= 0) return []
  const index = db
    .transaction('runs', 'readonly')
    .store.index(assistantId === undefined ? 'createdAt' : 'assistantId')
  const range = assistantId === undefined ? null : IDBKeyRange.only(assistantId)
  const records: RunRecord[] = []
  let cursor = await index.openCursor(range, 'prev')
  while (cursor !== null && (assistantId !== undefined || records.length < limit)) {
    const run = readRun(cursor.value)
    if (run !== undefined) records.push(run)
    cursor = await cursor.continue()
  }
  if (assistantId !== undefined) {
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit)
  }
  return records
}

export async function getRun(runId: string): Promise<RunRecord | undefined> {
  const db = await openAgentForgeDB()
  const value: unknown = await db.get('runs', runId)
  return value === undefined ? undefined : readRun(value)
}

export async function saveRun(run: RunRecord): Promise<void> {
  const value = runRecordSchema.parse(run)
  const db = await openAgentForgeDB()
  await db.put('runs', value)
}

export async function deleteRun(runId: string): Promise<void> {
  const db = await openAgentForgeDB()
  await db.delete('runs', runId)
}

export async function deleteRunsOfAssistant(assistantId: string): Promise<void> {
  const db = await openAgentForgeDB()
  const transaction = db.transaction('runs', 'readwrite')
  let cursor = await transaction.store
    .index('assistantId')
    .openCursor(IDBKeyRange.only(assistantId))
  while (cursor !== null) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await transaction.done
}

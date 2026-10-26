import { assistantSpecSchema, type AssistantSpec } from '../contracts/assistant'
import { openAgentForgeDB } from './db'

function readAssistant(value: unknown): AssistantSpec | undefined {
  const parsed = assistantSpecSchema.safeParse(value)
  if (parsed.success) return parsed.data
  const id = typeof value === 'object' && value !== null && 'id' in value ? value.id : undefined
  console.warn('[storage] 跳过无效记录', typeof id === 'string' ? id : 'unknown')
  return undefined
}

export async function listAssistants(): Promise<AssistantSpec[]> {
  const db = await openAgentForgeDB()
  const records: AssistantSpec[] = []
  for (const value of await db.getAll('assistants')) {
    const assistant = readAssistant(value)
    if (assistant !== undefined) records.push(assistant)
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getAssistant(id: string): Promise<AssistantSpec | undefined> {
  const db = await openAgentForgeDB()
  const value: unknown = await db.get('assistants', id)
  return value === undefined ? undefined : readAssistant(value)
}

export async function saveAssistant(assistant: AssistantSpec): Promise<void> {
  const value = assistantSpecSchema.parse(assistant)
  const db = await openAgentForgeDB()
  await db.put('assistants', value)
}

export async function deleteAssistant(id: string): Promise<void> {
  const db = await openAgentForgeDB()
  const transaction = db.transaction(['assistants', 'runs'], 'readwrite')
  await transaction.objectStore('assistants').delete(id)
  let cursor = await transaction
    .objectStore('runs')
    .index('assistantId')
    .openCursor(IDBKeyRange.only(id))
  while (cursor !== null) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await transaction.done
}

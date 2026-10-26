import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AssistantSpec } from '../contracts/assistant'
import type { RunRecord } from '../contracts/run-record'

export interface AgentForgeSchema extends DBSchema {
  assistants: {
    key: string
    value: AssistantSpec
  }
  runs: {
    key: string
    value: RunRecord
    indexes: {
      assistantId: string
      createdAt: string
    }
  }
}

export type AgentForgeDB = IDBPDatabase<AgentForgeSchema>

let databasePromise: Promise<AgentForgeDB> | undefined

export function openAgentForgeDB(): Promise<AgentForgeDB> {
  databasePromise ??= openDB<AgentForgeSchema>('agentforge', 1, {
    upgrade(database) {
      database.createObjectStore('assistants', { keyPath: 'id' })
      const runs = database.createObjectStore('runs', { keyPath: 'runId' })
      runs.createIndex('assistantId', 'assistantId')
      runs.createIndex('createdAt', 'createdAt')
    },
  })
  return databasePromise
}

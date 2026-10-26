import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssistantSpec } from '../contracts/assistant'
import { makeAssistant, makeRun } from '@/test/storage'

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('indexedDB', new IDBFactory())
})

afterEach(async () => {
  const { openAgentForgeDB } = await import('./db')
  ;(await openAgentForgeDB()).close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('assistant storage', () => {
  it('缓存数据库连接并建立约定的 store 与索引', async () => {
    const { openAgentForgeDB } = await import('./db')
    expect(openAgentForgeDB()).toBe(openAgentForgeDB())
    const db = await openAgentForgeDB()

    expect(db.name).toBe('agentforge')
    expect(db.version).toBe(1)
    expect([...db.objectStoreNames].sort()).toEqual(['assistants', 'runs'])
    expect([...db.transaction('runs').store.indexNames].sort()).toEqual([
      'assistantId',
      'createdAt',
    ])
  })

  it('保存、读取、更新并按 createdAt 倒序列出', async () => {
    const { saveAssistant, getAssistant, listAssistants } = await import('./assistants')
    const older = makeAssistant('older', '2026-10-26T00:00:00.000Z')
    const newer = makeAssistant('newer', '2026-10-27T00:00:00.000Z')
    await saveAssistant(older)
    await saveAssistant(newer)
    await saveAssistant({ ...older, tagline: '更新后的介绍' })

    expect((await listAssistants()).map((item) => item.id)).toEqual(['newer', 'older'])
    expect(await getAssistant('older')).toMatchObject({ tagline: '更新后的介绍' })
    expect(await getAssistant('missing')).toBeUndefined()
  })

  it('在同一个流程中级联删除助手的运行记录，保留其他助手', async () => {
    const assistants = await import('./assistants')
    const runs = await import('./runs')
    await assistants.saveAssistant(makeAssistant('a'))
    await assistants.saveAssistant(makeAssistant('b'))
    await runs.saveRun(makeRun('a-1', 'a'))
    await runs.saveRun(makeRun('a-2', 'a'))
    await runs.saveRun(makeRun('b-1', 'b'))

    await assistants.deleteAssistant('a')

    expect(await assistants.getAssistant('a')).toBeUndefined()
    expect(await assistants.getAssistant('b')).toBeDefined()
    expect(await runs.listRuns({ assistantId: 'a' })).toEqual([])
    expect((await runs.listRuns()).map((run) => run.runId)).toEqual(['b-1'])
  })

  it('读取时跳过无效记录，只警告记录 id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { openAgentForgeDB } = await import('./db')
    const { listAssistants, getAssistant } = await import('./assistants')
    const db = await openAgentForgeDB()
    await db.put('assistants', { id: 'broken', name: '不完整的记录' } as AssistantSpec)

    expect(await listAssistants()).toEqual([])
    expect(await getAssistant('broken')).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenNthCalledWith(1, '[storage] 跳过无效记录', 'broken')
    expect(warn).toHaveBeenNthCalledWith(2, '[storage] 跳过无效记录', 'broken')
  })

  it('写入不合法数据时抛错且不保存', async () => {
    const { saveAssistant, getAssistant } = await import('./assistants')
    const invalid = { ...makeAssistant('invalid'), name: ' ' }

    await expect(saveAssistant(invalid)).rejects.toThrow()
    expect(await getAssistant('invalid')).toBeUndefined()
  })
})

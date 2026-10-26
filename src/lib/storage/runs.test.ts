import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunRecord } from '../contracts/run-record'
import { makeRun } from '@/test/storage'

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

describe('run storage', () => {
  it('保存、读取、更新和删除运行记录', async () => {
    const { saveRun, getRun, deleteRun } = await import('./runs')
    const run = makeRun('run-1', 'a')
    await saveRun(run)
    await saveRun({ ...run, status: 'cancelled' })

    expect(await getRun('run-1')).toMatchObject({ assistantId: 'a', status: 'cancelled' })
    await deleteRun('run-1')
    expect(await getRun('run-1')).toBeUndefined()
  })

  it('按时间倒序、assistantId 过滤并限制返回条数', async () => {
    const { saveRun, listRuns } = await import('./runs')
    await saveRun(makeRun('a-old', 'a', '2026-10-25T00:00:00.000Z'))
    await saveRun(makeRun('b-mid', 'b', '2026-10-26T00:00:00.000Z'))
    await saveRun(makeRun('a-new', 'a', '2026-10-27T00:00:00.000Z'))

    expect((await listRuns({ limit: 2 })).map((run) => run.runId)).toEqual(['a-new', 'b-mid'])
    expect((await listRuns({ assistantId: 'a' })).map((run) => run.runId)).toEqual([
      'a-new',
      'a-old',
    ])
    expect((await listRuns({ assistantId: 'a', limit: 1 })).map((run) => run.runId)).toEqual([
      'a-new',
    ])
    expect(await listRuns({ limit: 0 })).toEqual([])
  })

  it('只删除指定助手的运行记录', async () => {
    const { saveRun, deleteRunsOfAssistant, listRuns } = await import('./runs')
    await saveRun(makeRun('a-1', 'a'))
    await saveRun(makeRun('a-2', 'a'))
    await saveRun(makeRun('b-1', 'b'))

    await deleteRunsOfAssistant('a')

    expect(await listRuns({ assistantId: 'a' })).toEqual([])
    expect((await listRuns()).map((run) => run.runId)).toEqual(['b-1'])
  })

  it('读取时跳过无效记录并警告 runId', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { openAgentForgeDB } = await import('./db')
    const { listRuns, getRun } = await import('./runs')
    const db = await openAgentForgeDB()
    await db.put('runs', {
      runId: 'broken-run',
      assistantId: 'a',
      createdAt: '2026-10-26T00:00:00.000Z',
    } as RunRecord)
    await db.put('runs', makeRun('valid', 'a', '2026-10-27T00:00:00.000Z'))

    expect((await listRuns()).map((run) => run.runId)).toEqual(['valid'])
    expect(await getRun('broken-run')).toBeUndefined()
    expect(warn).toHaveBeenCalledWith('[storage] 跳过无效记录', 'broken-run')
    expect(warn).not.toHaveBeenCalledWith('[storage] 跳过无效记录', 'valid')
  })

  it('写入不合法数据时抛错且不保存', async () => {
    const { saveRun, getRun } = await import('./runs')
    const invalid = { ...makeRun('invalid', 'a'), task: '' }

    await expect(saveRun(invalid)).rejects.toThrow()
    expect(await getRun('invalid')).toBeUndefined()
  })
})

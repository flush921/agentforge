import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copy'

afterEach(() => {
  vi.unstubAllGlobals()
})

function fakeDocument(execResult: boolean | Error) {
  const area = {
    value: '',
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    select: vi.fn(),
    remove: vi.fn(),
  }
  const execCommand = vi.fn(() => {
    if (execResult instanceof Error) throw execResult
    return execResult
  })
  const document = {
    createElement: vi.fn(() => area),
    body: { appendChild: vi.fn() },
    execCommand,
  }
  return { document, area, execCommand }
}

describe('copyText', () => {
  it('有 navigator.clipboard 时直接写入', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyText('答案')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('答案')
  })

  it('HTTP 页面没有 navigator.clipboard 时退回 execCommand，并清理临时文本框', async () => {
    const { document, area, execCommand } = fakeDocument(true)
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', document)

    await expect(copyText('答案')).resolves.toBe(true)
    expect(area.value).toBe('答案')
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(area.remove).toHaveBeenCalledTimes(1)
  })

  it('clipboard 写入被拒绝时也退回 execCommand', async () => {
    const { document, execCommand } = fakeDocument(true)
    vi.stubGlobal('navigator', {
      clipboard: { writeText: () => Promise.reject(new Error('denied')) },
    })
    vi.stubGlobal('document', document)

    await expect(copyText('答案')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledTimes(1)
  })

  it('两种办法都不行时返回 false，不抛错', async () => {
    const { document, area } = fakeDocument(new Error('unsupported'))
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', document)

    await expect(copyText('答案')).resolves.toBe(false)
    expect(area.remove).toHaveBeenCalledTimes(1)
  })
})

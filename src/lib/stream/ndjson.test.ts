import { describe, expect, it } from 'vitest'
import { encodeNdjsonLine, readNdjson } from './ndjson'

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const values: unknown[] = []
  for await (const value of readNdjson(stream)) {
    values.push(value)
  }
  return values
}

describe('encodeNdjsonLine', () => {
  it('编码为单行 JSON 并追加换行', () => {
    expect(encodeNdjsonLine({ type: 'text', delta: '你好\n世界' })).toBe(
      '{"type":"text","delta":"你好\\n世界"}\n',
    )
  })
})

describe('readNdjson', () => {
  it('处理逐字节拆开的 UTF-8 多字节字符和多块行', async () => {
    const bytes = new TextEncoder().encode('{"text":"你好"}\n{"text":"世界"}\n')
    const stream = streamFromChunks([...bytes].map((byte) => Uint8Array.of(byte)))
    await expect(collect(stream)).resolves.toEqual([{ text: '你好' }, { text: '世界' }])
  })

  it('跳过空行并处理没有换行符的末行', async () => {
    const encoder = new TextEncoder()
    const stream = streamFromChunks([encoder.encode('\n{"a":1}\n\n{"b":'), encoder.encode('2}')])
    await expect(collect(stream)).resolves.toEqual([{ a: 1 }, { b: 2 }])
  })

  it('非法行抛出固定错误并释放 reader 锁', async () => {
    const stream = streamFromChunks([new TextEncoder().encode('{bad}\n')])
    await expect(collect(stream)).rejects.toThrow('NDJSON 解析失败')
    expect(stream.locked).toBe(false)
  })
})

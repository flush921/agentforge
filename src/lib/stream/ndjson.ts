export function encodeNdjsonLine(value: unknown): string {
  return JSON.stringify(value) + '\n'
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    throw new Error('NDJSON 解析失败')
  }
}

export async function* readNdjson(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line.trim().length > 0) {
          yield parseLine(line)
        }
        newline = buffer.indexOf('\n')
      }
    }

    buffer += decoder.decode()
    if (buffer.trim().length > 0) {
      yield parseLine(buffer)
    }
  } finally {
    reader.releaseLock()
  }
}

import { describe, expect, it } from 'vitest'
import { AsyncQueue } from './queue'

async function drain<T>(queue: AsyncQueue<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of queue) {
    items.push(item)
  }
  return items
}

describe('AsyncQueue', () => {
  it('先 push 后读取，关闭后结束', async () => {
    const queue = new AsyncQueue<number>()
    queue.push(1)
    queue.push(2)
    queue.close()

    expect(await drain(queue)).toEqual([1, 2])
  })

  it('读取方先等待，push 时立即拿到', async () => {
    const queue = new AsyncQueue<string>()
    const reading = drain(queue)
    queue.push('a')
    await Promise.resolve()
    queue.push('b')
    queue.close()

    expect(await reading).toEqual(['a', 'b'])
  })

  it('失败前已 push 的条目先读完，再抛出错误', async () => {
    const queue = new AsyncQueue<number>()
    queue.push(1)
    queue.fail(new Error('boom'))
    const items: number[] = []

    await expect(
      (async () => {
        for await (const item of queue) items.push(item)
      })(),
    ).rejects.toThrow('boom')
    expect(items).toEqual([1])
  })

  it('关闭后的 push 被忽略', async () => {
    const queue = new AsyncQueue<number>()
    queue.close()
    queue.push(1)

    expect(await drain(queue)).toEqual([])
  })
})

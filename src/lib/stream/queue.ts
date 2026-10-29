/**
 * 单消费者异步队列：生产方 push / close / fail，消费方用 for await 读取。
 * 关闭或失败之前已经 push 的条目仍会先读完。
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = []
  private waiting:
    { resolve: (result: IteratorResult<T>) => void; reject: (error: unknown) => void } | undefined
  private closed = false
  private failure: { error: unknown } | undefined

  push(item: T): void {
    if (this.closed) {
      return
    }
    const waiting = this.waiting
    if (waiting !== undefined) {
      this.waiting = undefined
      waiting.resolve({ value: item, done: false })
      return
    }
    this.items.push(item)
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    const waiting = this.waiting
    this.waiting = undefined
    waiting?.resolve({ value: undefined, done: true })
  }

  fail(error: unknown): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.failure = { error }
    const waiting = this.waiting
    this.waiting = undefined
    waiting?.reject(error)
  }

  private next(): Promise<IteratorResult<T>> {
    if (this.items.length > 0) {
      return Promise.resolve({ value: this.items.shift() as T, done: false })
    }
    if (this.failure !== undefined) {
      return Promise.reject(this.failure.error)
    }
    if (this.closed) {
      return Promise.resolve({ value: undefined, done: true })
    }
    return new Promise((resolve, reject) => {
      this.waiting = { resolve, reject }
    })
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => this.next(),
      return: async () => {
        this.close()
        this.items = []
        return { value: undefined, done: true }
      },
    }
  }
}

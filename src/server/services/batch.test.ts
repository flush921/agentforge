import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentBatchLine, AgentStepRequest } from '@/lib/contracts/api'
import type { AgentLlmRequest, AgentStreamPart, LlmClient } from '@/server/llm/types'
import { makeStepRequest } from '@/test/step'
import { runAgentBatch } from './batch'

/** 每个请求按指令里的编号流出一段文本；编号为 fail 的请求直接抛错。 */
function scriptedLlm(gates: Map<string, Promise<void>> = new Map()): {
  client: LlmClient
  requests: AgentLlmRequest[]
} {
  const requests: AgentLlmRequest[] = []
  const client: LlmClient = {
    mode: 'mock',
    async generateJson() {
      throw new Error('unexpected_json_call')
    },
    async *streamAgent(req): AsyncIterable<AgentStreamPart> {
      requests.push(req)
      const tag = /编号 (\w+)/.exec(req.messages[0]?.content ?? '')?.[1] ?? '?'
      if (tag === 'fail') throw new Error('upstream')
      const gate = gates.get(tag)
      if (gate !== undefined) {
        await Promise.race([
          gate,
          new Promise<never>((_, reject) =>
            req.signal.addEventListener(
              'abort',
              () => reject(new DOMException('aborted', 'AbortError')),
              {
                once: true,
              },
            ),
          ),
        ])
      }
      yield { type: 'step-start' }
      yield { type: 'text', delta: `${tag} 正文` }
      yield { type: 'finish', usage: { inputTokens: 1, outputTokens: 2 } }
    },
  }
  return { client, requests }
}

function step(tag: string): AgentStepRequest {
  return makeStepRequest({ task: `编号 ${tag}`, isFinal: false })
}

async function collect(iterable: AsyncIterable<AgentBatchLine>): Promise<AgentBatchLine[]> {
  const lines: AgentBatchLine[] = []
  for await (const line of iterable) lines.push(line)
  return lines
}

describe('runAgentBatch', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('同时执行所有步骤，事件按下标区分，每个步骤以 done 收尾', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { client, requests } = scriptedLlm(new Map([['a', gate]]))
    const running = collect(
      runAgentBatch(client, [step('a'), step('b'), step('c')], new AbortController().signal),
    )

    // a 被卡住时，b、c 已经开始并完成：三路确实同时发出。
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requests).toHaveLength(3)
    release()
    const lines = await running

    for (const i of [0, 1, 2]) {
      const mine = lines.filter((line) => line.i === i)
      expect(mine.at(-1)?.event).toMatchObject({ type: 'done' })
    }
    const order = lines.filter((line) => line.event.type === 'done').map((line) => line.i)
    expect(order.at(-1)).toBe(0)
    expect(lines.find((line) => line.i === 1 && line.event.type === 'done')?.event).toMatchObject({
      output: 'b 正文',
    })
  })

  it('单个步骤出错只影响它自己', async () => {
    const { client } = scriptedLlm()
    const lines = await collect(
      runAgentBatch(client, [step('a'), step('fail')], new AbortController().signal),
    )

    expect(lines.filter((line) => line.i === 0).at(-1)?.event).toMatchObject({ type: 'done' })
    expect(lines.filter((line) => line.i === 1).at(-1)?.event).toMatchObject({ type: 'error' })
  })

  it('请求中断后所有步骤一起停止，流随即结束', async () => {
    const never = new Promise<void>(() => {})
    const { client } = scriptedLlm(
      new Map([
        ['a', never],
        ['b', never],
      ]),
    )
    const controller = new AbortController()
    const running = collect(runAgentBatch(client, [step('a'), step('b')], controller.signal))
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort()

    expect(await running).toEqual([])
  })
})

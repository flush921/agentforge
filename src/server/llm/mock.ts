import 'server-only'

import { toolNameSchema, type ToolName } from '@/lib/contracts/common'
import { assessHeuristic } from '@/server/mock/assess-heuristic'
import { selectAssistantDraft } from '@/server/mock/assistants'
import { createMockPlan } from '@/server/mock/plans'
import type { LlmClient, LlmJsonRequest, LlmKind } from './types'

const MOCK_DELAYS: Record<LlmKind, number> = {
  generate: 600,
  assess: 300,
  plan: 900,
}

let delayOverride: number | undefined

export function setMockDelayForTests(delay?: number): void {
  delayOverride = delay
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError()
  }
}

async function waitForDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  if (milliseconds === 0) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function lastUserContent(req: LlmJsonRequest): string {
  return req.messages.findLast((message) => message.role === 'user')?.content ?? ''
}

function readData(content: string, tag: 'request' | 'task'): string {
  const match = new RegExp(`<${tag}>\n([\\s\\S]*?)\n</${tag}>`).exec(content)
  return match?.[1]?.replaceAll('<\\/', '</') ?? ''
}

function readPlannerLevel(instructions: string): 2 | 3 | 4 {
  const value = /本次级别：L([234])/.exec(instructions)?.[1]
  if (value === undefined) {
    throw new Error('mock 计划提示词缺少有效级别')
  }
  return Number(value) as 2 | 3 | 4
}

function readPlannerTools(instructions: string): ToolName[] {
  const section = instructions.split('可用工具：\n')[1]?.split('\n\n设计原则：')[0] ?? ''
  const tools: ToolName[] = []

  for (const match of section.matchAll(/^- ([a-z_]+)：/gm)) {
    const parsed = toolNameSchema.safeParse(match[1])
    if (parsed.success) {
      tools.push(parsed.data)
    }
  }

  return tools
}

function responseText(req: LlmJsonRequest): string {
  const user = lastUserContent(req)

  if (req.kind === 'generate') {
    return JSON.stringify(selectAssistantDraft(readData(user, 'request')))
  }

  if (req.kind === 'assess') {
    return JSON.stringify(assessHeuristic(readData(user, 'task')))
  }

  return JSON.stringify(
    createMockPlan(readPlannerLevel(req.instructions), readPlannerTools(req.instructions)),
  )
}

export function createMockClient(): LlmClient {
  return {
    mode: 'mock',
    async generateJson(req) {
      await waitForDelay(delayOverride ?? MOCK_DELAYS[req.kind], req.signal)
      throwIfAborted(req.signal)

      const text = responseText(req)
      const input = req.instructions + req.messages.map((message) => message.content).join('')
      return {
        text,
        usage: {
          inputTokens: Math.ceil(input.length / 2),
          outputTokens: Math.ceil(text.length / 2),
        },
      }
    },
  }
}

import 'server-only'

import { agentRoleSchema, toolNameSchema, type ToolName, type Usage } from '@/lib/contracts/common'
import { assessHeuristic } from '@/server/mock/assess-heuristic'
import { selectAssistantDraft } from '@/server/mock/assistants'
import { createMockPlan } from '@/server/mock/plans'
import { buildMockStepContent, type MockStepContentInput } from '@/server/mock/step-content'
import { ROLE_DESCRIPTIONS } from '@/server/prompts/catalog'
import { buildToolSet, summarizeToolResult } from '@/server/tools/registry'
import type { AgentLlmRequest, LlmClient, LlmJsonRequest, LlmKind } from './types'

const MOCK_DELAYS: Record<LlmKind, number> = {
  generate: 600,
  assess: 300,
  plan: 900,
  review: 300,
  judge: 400,
  align: 300,
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

function lastUserContent(req: { messages: Array<{ role: string; content: string }> }): string {
  return req.messages.findLast((message) => message.role === 'user')?.content ?? ''
}

function readData(content: string, tag: 'feedback' | 'request' | 'task' | 'deliverable'): string {
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

function readWorkerInput(req: AgentLlmRequest): MockStepContentInput {
  const user = lastUserContent(req)
  const standalone = req.instructions.includes('请直接完成用户的任务。')
  const role = standalone
    ? 'specialist'
    : (agentRoleSchema.options.find((candidate) => {
        const label = ROLE_DESCRIPTIONS[candidate].split('：')[0]
        return req.instructions.includes(`角色是「${label}」`)
      }) ?? 'specialist')
  const feedback = readData(user, 'feedback')
  const lane = /其中一路，取向「([^」]+)」/.exec(req.instructions)?.[1]

  return {
    role,
    title: standalone
      ? '直接回答'
      : (/负责其中一个环节：「([^」]+)」/.exec(req.instructions)?.[1] ?? '任务执行'),
    instruction: standalone
      ? (/^1\. ([^\n]+)/m.exec(req.instructions)?.[1] ?? '完成用户任务')
      : (/1\. 本环节的任务：([^\n]+)/.exec(req.instructions)?.[1] ?? '完成用户任务'),
    task: readData(user, 'task'),
    upstreamTitles: [...user.matchAll(/<upstream id="[a-z0-9_]+">\n【([^】]+)】/g)].map(
      (match) => match[1] ?? '',
    ),
    isFinal: standalone || req.instructions.includes('你的产出会直接交付给用户'),
    ...(lane !== undefined ? { lane } : {}),
    ...(feedback.length > 0 ? { revision: { feedback } } : {}),
  }
}

function textHash(text: string): number {
  let hash = 0
  for (const char of text) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  }
  return hash
}

/** 同一份成果在交叉评审的两个位置上得到相同分数，胜负与先后顺序无关。 */
function mockScores(text: string): number[] {
  const hash = textHash(text)
  return [6 + (hash % 4), 6 + ((hash >>> 3) % 4), 6 + ((hash >>> 6) % 4)]
}

function responseText(req: LlmJsonRequest): string {
  const user = lastUserContent(req)

  if (req.kind === 'generate') {
    return JSON.stringify(selectAssistantDraft(readData(user, 'request')))
  }
  if (req.kind === 'assess') {
    return JSON.stringify(assessHeuristic(readData(user, 'task')))
  }
  if (req.kind === 'judge') {
    const candidates = [...user.matchAll(/<candidate no="\d+">\n([\s\S]*?)\n<\/candidate>/g)].map(
      (match) => match[1] ?? '',
    )
    const scores = candidates.map(mockScores)
    const sums = scores.map((item) => item.reduce((total, score) => total + score, 0))
    return JSON.stringify({
      scores,
      prefer: sums.indexOf(Math.max(...sums)) + 1,
      reason: '要点覆盖更完整，依据交代更清楚，下游可以直接使用。',
    })
  }
  if (req.kind === 'align') {
    // 按成果内容确定性地决定是否偏离，离线演示里也能看到纠偏。
    const drifted = textHash(readData(user, 'deliverable')) % 3 === 0
    return JSON.stringify(
      drifted
        ? {
            score: 5,
            drift: [
              '收拢到用户任务的核心目标，删去与整体策略无关的展开',
              '补上与后续环节衔接的结论',
            ],
            summary: '成果有所偏题，已按整体目标纠偏。',
          }
        : { score: 8, drift: [], summary: '方向与整体目标一致，沿用择优结果。' },
    )
  }
  if (req.kind === 'review') {
    return JSON.stringify(
      user.includes('<feedback>')
        ? { verdict: 'pass', issues: [], summary: '上一轮审校意见已落实，交付物可以通过。' }
        : {
            verdict: 'revise',
            issues: ['补充关键结论的数据依据', '精简重复内容并明确行动建议'],
            summary: '交付物仍需补充依据并优化表达。',
          },
    )
  }

  return JSON.stringify(
    createMockPlan(readPlannerLevel(req.instructions), readPlannerTools(req.instructions)),
  )
}

function estimateUsage(
  instructions: string,
  messages: Array<{ content: string }>,
  output: string,
): Usage {
  const input = instructions + messages.map((message) => message.content).join('')
  return {
    inputTokens: Math.ceil(input.length / 2),
    outputTokens: Math.ceil(output.length / 2),
  }
}

export function createMockClient(): LlmClient {
  return {
    mode: 'mock',
    async generateJson(req) {
      await waitForDelay(delayOverride ?? MOCK_DELAYS[req.kind], req.signal)
      throwIfAborted(req.signal)

      const text = responseText(req)
      return { text, usage: estimateUsage(req.instructions, req.messages, text) }
    },
    async *streamAgent(req) {
      const content = buildMockStepContent(readWorkerInput(req))
      const pause = () => waitForDelay(delayOverride ?? 50, req.signal)
      let generated = ''

      if (req.tools.includes('calculator')) {
        await pause()
        yield { type: 'step-start' }
        const callId = 'mock_calculator_1'
        const input = { expression: '(128*3*0.85-40)' }
        await pause()
        yield { type: 'tool_call', callId, tool: 'calculator', input }

        const calculator = buildToolSet(['calculator']).calculator
        if (calculator?.execute === undefined) {
          throw new Error('calculator 工具未注册 execute')
        }
        const output = await calculator.execute(input, {
          toolCallId: callId,
          messages: [],
          context: {},
          abortSignal: req.signal,
        })
        await pause()
        yield {
          type: 'tool_result',
          callId,
          ok: true,
          summary: summarizeToolResult('calculator', output),
        }
      }

      if (req.tools.includes('datetime')) {
        await pause()
        yield { type: 'step-start' }
        const callId = 'mock_datetime_1'
        const input = { timezone: 'Asia/Shanghai' }
        await pause()
        yield { type: 'tool_call', callId, tool: 'datetime', input }

        const datetime = buildToolSet(['datetime']).datetime
        if (datetime?.execute === undefined) {
          throw new Error('datetime 工具未注册 execute')
        }
        const output = await datetime.execute(input, {
          toolCallId: callId,
          messages: [],
          context: {},
          abortSignal: req.signal,
        })
        await pause()
        yield {
          type: 'tool_result',
          callId,
          ok: true,
          summary: summarizeToolResult('datetime', output),
        }
      }

      await pause()
      yield { type: 'step-start' }

      if (req.thinking) {
        for (const reasoning of ['先核对任务目标与材料范围。', '再组织结论并检查依据是否充分。']) {
          await pause()
          generated += reasoning
          yield { type: 'reasoning', delta: reasoning }
        }
      }

      for (let offset = 0; offset < content.length; offset += 12) {
        const delta = content.slice(offset, offset + 12)
        await pause()
        generated += delta
        yield { type: 'text', delta }
      }

      yield { type: 'finish', usage: estimateUsage(req.instructions, req.messages, generated) }
    },
  }
}

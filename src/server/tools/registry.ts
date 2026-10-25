import 'server-only'

import type { ToolSet } from 'ai'
import type { ToolName } from '@/lib/contracts/common'
import { createDatetimeTool, type DatetimeOutput } from './datetime'

export interface ToolDependencies {
  now?: () => Date
}

export function buildToolSet(names: ToolName[], deps: ToolDependencies = {}): ToolSet {
  const registry: Partial<Record<ToolName, ReturnType<typeof createDatetimeTool>>> = {
    datetime: createDatetimeTool(deps.now),
  }
  const tools: ToolSet = {}

  for (const name of new Set(names)) {
    const implementation = registry[name]
    if (implementation !== undefined) {
      tools[name] = implementation
    }
  }

  return tools
}

function isDatetimeOutput(output: unknown): output is DatetimeOutput {
  if (typeof output !== 'object' || output === null) {
    return false
  }

  return ['date', 'time', 'weekday', 'timezone'].every(
    (key) => Reflect.get(output, key) !== undefined,
  )
}

export function summarizeToolResult(name: ToolName, output: unknown): string {
  if (name === 'datetime' && isDatetimeOutput(output)) {
    return `${output.date} ${output.weekday} ${output.time}（${output.timezone}）`.slice(0, 300)
  }

  return (JSON.stringify(output) ?? '').slice(0, 300)
}

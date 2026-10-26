import { toolsForCapabilities, type Capability, type ToolName } from '../contracts/common'

export const AVAILABLE_TOOLS = ['datetime', 'calculator'] as const satisfies readonly ToolName[]

export function usableTools(capabilities: Capability[]): ToolName[] {
  const available = new Set<ToolName>(AVAILABLE_TOOLS)
  return toolsForCapabilities(capabilities).filter((tool) => available.has(tool))
}

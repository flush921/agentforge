import { z } from 'zod'

export const directionSchema = z.enum([
  'agent',
  'rag',
  'multimodal',
  'office',
  'education',
  'health',
  'coding',
  'data',
  'safety',
  'social',
])
export const capabilitySchema = z.enum([
  'web_search',
  'calculator',
  'datetime',
  'chart',
  'knowledge_base',
  'image_input',
])
export const toolNameSchema = z.enum(['web_search', 'calculator', 'datetime', 'chart', 'kb_search'])
export const levelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
])
export const agentRoleSchema = z.enum([
  'researcher',
  'analyst',
  'writer',
  'coder',
  'reviewer',
  'synthesizer',
  'specialist',
])
export const usageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
})
export const errorCodeSchema = z.enum([
  'bad_request',
  'unauthorized',
  'rate_limited',
  'upstream_error',
  'timeout',
  'cancelled',
  'internal',
])
export const apiErrorSchema = z.strictObject({
  code: errorCodeSchema,
  message: z.string().trim().min(1).max(500),
})
export const requiredUnknownSchema = z.custom<unknown>((value) => value !== undefined, '字段必填')

export type Direction = z.infer<typeof directionSchema>
export type Capability = z.infer<typeof capabilitySchema>
export type ToolName = z.infer<typeof toolNameSchema>
export type Level = z.infer<typeof levelSchema>
export type AgentRole = z.infer<typeof agentRoleSchema>
export type Usage = z.infer<typeof usageSchema>
export type ErrorCode = z.infer<typeof errorCodeSchema>
export type ApiError = z.infer<typeof apiErrorSchema>

const toolOrder: ToolName[] = ['web_search', 'calculator', 'datetime', 'chart', 'kb_search']

export function toolsForCapabilities(capabilities: Capability[]): ToolName[] {
  const selected = new Set<Capability>(capabilities)

  return toolOrder.filter((tool) => {
    if (tool === 'kb_search') {
      return selected.has('knowledge_base')
    }

    return selected.has(tool)
  })
}

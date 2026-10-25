import { z } from 'zod'
import { capabilitySchema, directionSchema } from './common'

export const assistantDraftSchema = z.strictObject({
  name: z.string().trim().min(1).max(20),
  avatar: z.string().trim().min(1).max(8),
  color: z
    .string()
    .trim()
    .min(7)
    .max(7)
    .regex(/^#[0-9a-fA-F]{6}$/, '颜色必须是 #RRGGBB 格式'),
  tagline: z.string().trim().min(1).max(40),
  domain: z.string().trim().min(1).max(20),
  directions: z
    .array(directionSchema)
    .min(1)
    .max(3)
    .refine((items) => new Set(items).size === items.length, 'directions 不得重复'),
  persona: z.string().trim().min(1).max(800),
  capabilities: z
    .array(capabilitySchema)
    .max(6)
    .refine((items) => new Set(items).size === items.length, 'capabilities 不得重复'),
  defaultIntensity: z.number().min(0).max(1),
  guardrails: z.strictObject({
    refuseTopics: z.array(z.string().trim().min(1).max(30)).max(8),
    disclaimer: z.string().trim().min(1).max(120).optional(),
  }),
  starters: z.array(z.string().trim().min(4).max(120)).min(3).max(4),
})

export const assistantSpecSchema = z.strictObject({
  ...assistantDraftSchema.shape,
  id: z.string().trim().min(1).max(64),
  schemaVersion: z.literal(1),
  createdAt: z
    .string()
    .trim()
    .pipe(z.iso.datetime({ offset: true })),
  sourcePrompt: z.string().trim().min(1).max(300),
})

export type AssistantDraft = z.infer<typeof assistantDraftSchema>
export type AssistantSpec = z.infer<typeof assistantSpecSchema>

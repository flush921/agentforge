import {
  assistantSpecSchema,
  type AssistantDraft,
  type AssistantSpec,
} from '../contracts/assistant'

export function draftToSpec(
  draft: AssistantDraft,
  sourcePrompt: string,
  { id, now }: { id: string; now: string },
): AssistantSpec {
  return assistantSpecSchema.parse({
    ...draft,
    id,
    schemaVersion: 1,
    createdAt: now,
    sourcePrompt: sourcePrompt.trim(),
  })
}

import type { AssistantSpec } from '../contracts/assistant'
import { PRESET_ASSISTANTS } from '../fixtures/preset-assistants'
import { getAssistant } from '../storage/assistants'

export async function findAssistant(id: string): Promise<AssistantSpec | undefined> {
  let saved: AssistantSpec | undefined
  try {
    saved = await getAssistant(id)
  } catch {
    saved = undefined
  }
  return saved ?? PRESET_ASSISTANTS.find((assistant) => assistant.id === id)
}

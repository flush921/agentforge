import { create } from 'zustand'
import type { RunEvent } from '@/lib/contracts/events'
import type { Plan } from '@/lib/contracts/plan'
import { applyEvent, initialRunState } from '@/lib/run/reducer'
import type { RunState } from '@/lib/run/types'

export type RunPhase = 'idle' | 'running' | 'awaiting_confirm' | 'done'

export interface RunStore {
  events: RunEvent[]
  state: RunState
  phase: RunPhase
  pendingPlan?: Plan
  error?: string
  reset: () => void
  push: (event: RunEvent) => void
  setPhase: (phase: RunPhase) => void
  setPendingPlan: (plan?: Plan) => void
}

export const useRunStore = create<RunStore>()((set) => ({
  events: [],
  state: initialRunState(),
  phase: 'idle',
  reset() {
    set({
      events: [],
      state: initialRunState(),
      phase: 'idle',
      pendingPlan: undefined,
      error: undefined,
    })
  },
  push(event) {
    set((current) => ({
      events: [...current.events, event],
      state: applyEvent(current.state, event),
    }))
  },
  setPhase(phase) {
    set({ phase })
  },
  setPendingPlan(plan) {
    set({ pendingPlan: plan })
  },
}))

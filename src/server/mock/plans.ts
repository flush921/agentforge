import 'server-only'

import type { ToolName } from '@/lib/contracts/common'
import type { Plan } from '@/lib/contracts/plan'
import { validPlans } from '@/lib/fixtures/plans'

export function createMockPlan(level: 2 | 3 | 4, tools: ToolName[]): Plan {
  const plan = structuredClone(validPlans[level])
  const firstTool = tools[0]
  let researcherAssigned = false

  for (const node of plan.nodes) {
    node.tools = []
    if (!researcherAssigned && node.role === 'researcher' && firstTool !== undefined) {
      node.tools = [firstTool]
      researcherAssigned = true
    }
  }

  return plan
}

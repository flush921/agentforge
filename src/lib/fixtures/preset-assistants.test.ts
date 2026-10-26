import { describe, expect, it } from 'vitest'
import { assessHeuristic } from '@/server/mock/assess-heuristic'
import { assistantSpecSchema } from '../contracts/assistant'
import { decideLevel } from '../orchestrator/level'
import { usableTools } from '../orchestrator/tools'
import { PRESET_ASSISTANTS } from './preset-assistants'

describe('PRESET_ASSISTANTS', () => {
  it('包含指定的三个示例及其能力配置', () => {
    expect(
      PRESET_ASSISTANTS.map((assistant) => ({
        id: assistant.id,
        directions: assistant.directions,
        capabilities: assistant.capabilities,
        defaultIntensity: assistant.defaultIntensity,
        createdAt: assistant.createdAt,
      })),
    ).toEqual([
      {
        id: 'preset-kaoyan',
        directions: ['education', 'agent'],
        capabilities: ['datetime', 'web_search'],
        defaultIntensity: 0.6,
        createdAt: '2026-10-26T00:00:00.000Z',
      },
      {
        id: 'preset-diet',
        directions: ['health'],
        capabilities: ['datetime', 'calculator'],
        defaultIntensity: 0.4,
        createdAt: '2026-10-26T00:00:00.000Z',
      },
      {
        id: 'preset-data',
        directions: ['data', 'office'],
        capabilities: ['calculator', 'chart', 'datetime'],
        defaultIntensity: 0.7,
        createdAt: '2026-10-26T00:00:00.000Z',
      },
    ])
  })

  for (const assistant of PRESET_ASSISTANTS) {
    it(`${assistant.name} 通过 schema， starters 在 mock 下由易到难`, () => {
      expect(assistantSpecSchema.safeParse(assistant).success).toBe(true)
      expect(assistant.starters).toHaveLength(4)
      const levels = assistant.starters.map((starter) => {
        const assessment = assessHeuristic(starter)
        return decideLevel(
          assessment.dims,
          assistant.defaultIntensity,
          usableTools(assistant.capabilities).length > 0,
        ).level
      })

      expect([0, 1]).toContain(levels[0])
      expect(levels.at(-1)).toBeGreaterThanOrEqual(3)
    })
  }

  it('健康示例包含免责声明和拒答主题', () => {
    const diet = PRESET_ASSISTANTS.find((assistant) => assistant.id === 'preset-diet')
    expect(diet?.guardrails.disclaimer).toBeTruthy()
    expect(diet?.guardrails.refuseTopics.length).toBeGreaterThan(0)
  })
})

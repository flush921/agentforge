import { describe, expect, it } from 'vitest'
import { AVAILABLE_TOOLS, usableTools } from './tools'

describe('usableTools', () => {
  it('只保留当前已实现的工具', () => {
    expect(AVAILABLE_TOOLS).toEqual(['datetime', 'calculator'])
    expect(usableTools(['web_search', 'calculator', 'datetime', 'knowledge_base'])).toEqual([
      'calculator',
      'datetime',
    ])
    expect(usableTools(['web_search', 'knowledge_base', 'image_input'])).toEqual([])
  })

  it('保持工具定义顺序', () => {
    expect(usableTools(['knowledge_base', 'datetime', 'calculator'])).toEqual([
      'calculator',
      'datetime',
    ])
  })
})

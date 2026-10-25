import { describe, expect, it } from 'vitest'
import { AVAILABLE_TOOLS, usableTools } from './tools'

describe('usableTools', () => {
  it('只保留当前已实现的工具', () => {
    expect(AVAILABLE_TOOLS).toEqual(['datetime'])
    expect(usableTools(['web_search', 'datetime', 'knowledge_base'])).toEqual(['datetime'])
    expect(usableTools(['web_search', 'knowledge_base', 'image_input'])).toEqual([])
  })

  it('保持工具定义顺序', () => {
    expect(usableTools(['knowledge_base', 'datetime'])).toEqual(['datetime'])
  })
})

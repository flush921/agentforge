import { describe, expect, it } from 'vitest'
import { capabilitySchema, directionSchema } from '../contracts/common'
import { CAPABILITY_LABELS, DIRECTION_LABELS, isCapabilityAvailable } from './labels'

describe('assistant labels', () => {
  it('覆盖全部十个方向，顺序与契约一致', () => {
    expect(Object.keys(DIRECTION_LABELS)).toEqual(directionSchema.options)
    expect(Object.values(DIRECTION_LABELS)).toEqual([
      '智能体',
      '知识问答',
      '多模态',
      '协同办公',
      '教育学习',
      '健康生活',
      '代码开发',
      '数据分析',
      '安全治理',
      '社交社区',
    ])
  })

  it('覆盖全部六种能力', () => {
    expect(Object.keys(CAPABILITY_LABELS)).toEqual(capabilitySchema.options)
    expect(Object.values(CAPABILITY_LABELS)).toEqual([
      '联网搜索',
      '精确计算',
      '日期时间',
      '图表',
      '知识库',
      '图片理解',
    ])
  })

  it('只把已实现的能力标为可用', () => {
    expect(isCapabilityAvailable('datetime')).toBe(true)
    expect(isCapabilityAvailable('web_search')).toBe(false)
    expect(isCapabilityAvailable('image_input')).toBe(false)
  })
})

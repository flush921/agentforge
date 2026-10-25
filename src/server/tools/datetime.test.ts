import { describe, expect, it } from 'vitest'
import { createDatetimeTool } from './datetime'

const fixedNow = () => new Date('2026-10-26T06:03:04.005Z')

async function executeDatetime(timezone?: string) {
  const datetime = createDatetimeTool(fixedNow)
  if (datetime.execute === undefined) {
    throw new Error('datetime execute 未定义')
  }
  return datetime.execute({ timezone }, { toolCallId: 'datetime-test', messages: [], context: {} })
}

describe('createDatetimeTool', () => {
  it('用 Asia/Shanghai 计算日期、时间、星期和 ISO', async () => {
    await expect(executeDatetime('Asia/Shanghai')).resolves.toEqual({
      date: '2026-10-26',
      time: '14:03',
      weekday: '星期一',
      timezone: 'Asia/Shanghai',
      iso: '2026-10-26T06:03:04.005Z',
    })
  })

  it('支持 UTC 和默认时区', async () => {
    await expect(executeDatetime('UTC')).resolves.toMatchObject({
      date: '2026-10-26',
      time: '06:03',
      weekday: '星期一',
      timezone: 'UTC',
    })
    await expect(executeDatetime()).resolves.toMatchObject({ timezone: 'Asia/Shanghai' })
  })

  it('无效时区抛出固定错误', async () => {
    await expect(executeDatetime('Invalid/Timezone')).rejects.toThrow('无效的时区')
  })
})

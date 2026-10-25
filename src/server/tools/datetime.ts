import 'server-only'

import { tool } from 'ai'
import { z } from 'zod'

export interface DatetimeOutput {
  date: string
  time: string
  weekday: string
  timezone: string
  iso: string
}

function dateParts(date: Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', options)
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
}

function formatDatetime(date: Date, timezone: string): DatetimeOutput {
  try {
    const local = dateParts(date, {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    const utc = dateParts(date, {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hourCycle: 'h23',
    })
    const weekday = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      weekday: 'long',
    }).format(date)

    return {
      date: `${local.year}-${local.month}-${local.day}`,
      time: `${local.hour}:${local.minute}`,
      weekday,
      timezone,
      iso: `${utc.year}-${utc.month}-${utc.day}T${utc.hour}:${utc.minute}:${utc.second}.${utc.fractionalSecond}Z`,
    }
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error('无效的时区')
    }
    throw error
  }
}

export function createDatetimeTool(now: () => Date = () => new Date()) {
  return tool({
    description: '获取当前日期、时间和星期。需要知道"今天"、"现在"或计算日期间隔时调用。',
    inputSchema: z.object({ timezone: z.string().trim().max(64).optional() }),
    execute: async ({ timezone = 'Asia/Shanghai' }, { abortSignal }) => {
      abortSignal?.throwIfAborted()
      return formatDatetime(now(), timezone)
    },
  })
}

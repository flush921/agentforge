import type { RunEvent } from '../contracts/events'
import { runRecordSchema } from '../contracts/run-record'
import { sampleRunL4 } from '../fixtures/runs'

/**
 * 新手教程里「复杂任务」那一步播放的演示回放。
 *
 * 正常情况下播放的是一次真实运行的录像：public/demo-run.json，
 * 是线上跑完考研顾问的复杂示例后，从浏览器的运行记录里原样导出的（约 480KB，所以不打进 JS 包，按需加载）。
 * 文件取不到或格式不对时退回手写的示例数据，页面上会如实标成「示例数据」。
 */
export interface DemoRun {
  task: string
  events: readonly RunEvent[]
  /** true 表示这是一次真实运行的录像，false 表示手写的示例数据。 */
  recorded: boolean
  /** 录制日期（YYYY-MM-DD）和当时的实际用时，只有真实录像才有。 */
  recordedOn?: string
  durationMs?: number
}

export const DEMO_RUN_URL = '/demo-run.json'

/** 回放倍速：真实运行约 3 分 17 秒，8 倍速约 25 秒看完。 */
export const DEMO_SPEED = 8

export const FALLBACK_DEMO_RUN: DemoRun = {
  task: '调研大学生使用 AI 学习工具的现状，写一份带数据和建议的分析报告',
  events: sampleRunL4,
  recorded: false,
}

/** 校验导出的运行记录；只接受正常完成的运行，其余情况返回 undefined，由调用方退回示例数据。 */
export function parseDemoRun(value: unknown): DemoRun | undefined {
  const parsed = runRecordSchema.safeParse(value)
  if (!parsed.success || parsed.data.status !== 'completed' || parsed.data.events.length === 0) {
    return undefined
  }
  const record = parsed.data
  return {
    task: record.task,
    events: record.events,
    recorded: true,
    recordedOn: record.createdAt.slice(0, 10),
    ...(record.durationMs === undefined ? {} : { durationMs: record.durationMs }),
  }
}

/** 演示回放页顶部说明条的文字。 */
export function demoNote(run: DemoRun): string {
  const tail = '不是实时生成的结果，也不消耗 token。想看真实运行，请回到工作台点一条示例。'
  if (!run.recorded) {
    return `这是一段示例数据，用来演示复杂任务的编排过程，${tail}`
  }
  const seconds = Math.round((run.durationMs ?? 0) / 1000)
  const took =
    seconds > 0 ? `（当时实际用时 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒）` : ''
  return `这是 ${run.recordedOn ?? '此前'} 预先录制的一次真实运行${took}，现在按 ${DEMO_SPEED} 倍速回放，${tail}`
}

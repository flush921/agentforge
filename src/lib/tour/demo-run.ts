import type { RunEvent } from '../contracts/events'
import { sampleRunL4 } from '../fixtures/runs'

/**
 * 新手教程里「复杂任务」那一步播放的演示回放。
 *
 * recorded 表示这段事件是不是一次真实运行的录像：
 * 目前是手写的示例数据（lib/fixtures/runs.ts），页面上会如实标成「示例数据」；
 * 换成真实运行导出的事件后改成 true，页面文案随之变成「预先录制的真实运行」。
 */
export const DEMO_RUN: { task: string; events: readonly RunEvent[]; recorded: boolean } = {
  task: '调研大学生使用 AI 学习工具的现状，写一份带数据和建议的分析报告',
  events: sampleRunL4,
  recorded: false,
}

/** 回放默认 2 倍速：40 秒的运行约 20 秒看完。 */
export const DEMO_SPEED = 2

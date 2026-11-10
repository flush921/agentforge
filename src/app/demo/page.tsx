import type { Metadata } from 'next'
import { DemoClient } from './DemoClient'

export const metadata: Metadata = {
  title: '演示回放｜AgentForge',
}

/** 新手教程用的演示回放页：播放一段固定的复杂任务运行，不调用模型。 */
export default function DemoPage() {
  return <DemoClient />
}

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AgentForge｜生成 Agent 的 Agent',
  description: '一句话生成你的专属 Agent，按任务难度自动编排子 Agent 协作。',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="zh-CN" className="dark h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  )
}

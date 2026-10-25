import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AgentForge｜专属 AI 助手生成器',
  description: '一句话生成你的专属 AI 助手。',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="zh-CN" className="dark h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  )
}

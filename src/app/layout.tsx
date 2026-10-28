import type { Metadata } from 'next'
import { AccessGate } from '@/components/site/AccessGate'
import { SiteBackdrop } from '@/components/visual/SiteBackdrop'
import { DEFAULT_THEME, THEME_BOOT_SCRIPT } from '@/lib/visual/theme'
import './globals.css'

export const metadata: Metadata = {
  title: 'AgentForge｜生成 Agent 的 Agent',
  description: '一句话生成你的专属 Agent，按任务难度自动编排子 Agent 协作。',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // 服务端先输出默认风格，首屏脚本在 hydration 前按记忆或 ?theme= 改写 data-theme，属性不一致是预期行为。
    <html
      lang="zh-CN"
      data-theme={DEFAULT_THEME}
      className="dark h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <SiteBackdrop />
        {children}
        <AccessGate />
      </body>
    </html>
  )
}

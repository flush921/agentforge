import { Workflow } from 'lucide-react'
import { SiteHeader } from '@/components/site/SiteHeader'
import { HomeClient } from './HomeClient'

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-text-primary">
      <SiteHeader libraryHref="#library" />
      <main className="mx-auto w-full max-w-[1080px] px-4 pb-16 sm:px-6">
        <section className="mx-auto max-w-3xl pb-8 pt-10 text-center">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand/10 px-2.5 py-1 text-[10px] tracking-wide text-brand">
            <Workflow className="size-3.5" aria-hidden />
            按需编排 · 让每一个任务都有合适的团队
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            一句话，生成你的
            <span className="whitespace-nowrap">
              专属 <span className="text-brand">AI 助手</span>
            </span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
            它会按任务难度，自动调度 1 到 N 个 Agent 协作完成，并把整个过程画给你看
          </p>
        </section>
        <HomeClient />
      </main>
    </div>
  )
}

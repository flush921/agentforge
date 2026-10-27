import { SiteHeader } from '@/components/site/SiteHeader'
import { OrchestrationShowcase } from '@/components/visual/OrchestrationShowcase'
import { ScrambleText } from '@/components/visual/ScrambleText'
import { HomeClient } from './HomeClient'

const stats = [
  { value: '86.7%', label: '留出集定级准确率' },
  { value: '−63%', label: 'Token 消耗（对比一律满配）' },
  { value: 'L0–L4', label: '五级自适应编排' },
]

export default function Home() {
  return (
    <div className="min-h-screen text-text-primary">
      <SiteHeader libraryHref="#library" />
      <main className="mx-auto w-full max-w-[1160px] px-4 pb-20 sm:px-6">
        <section className="grid items-center gap-10 pb-12 pt-12 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/[0.07] px-3 py-1 font-mono text-[11px] tracking-wider text-brand backdrop-blur">
              <span className="size-1.5 rounded-full bg-brand shadow-[0_0_8px_var(--brand)]" />
              <ScrambleText text="AGENT · THAT · BUILDS · AGENTS" />
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.15] tracking-tight sm:text-[3.4rem]">
              一句话，生成你的
              <br />
              专属 <span className="text-gradient-brand">Agent</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-text-secondary">
              AgentForge 是一个生成 Agent 的 Agent：为你生成专属 Agent，再按任务难度调度 1 到 N 个子
              Agent 协作完成，并把整个编排过程实时画给你看。
            </p>
            <dl className="mt-8 grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06]">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col-reverse bg-background/70 px-4 py-3 backdrop-blur"
                >
                  <dt className="mt-1 text-[11px] leading-4 text-ink-muted">{stat.label}</dt>
                  <dd className="font-mono text-xl font-semibold text-text-primary sm:text-2xl">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <OrchestrationShowcase />
        </section>
        <HomeClient />
      </main>
      <footer className="border-t border-white/[0.06] py-6 text-center font-mono text-[11px] tracking-wider text-ink-muted">
        TEAM ADASTRA · 西安交通大学 · 传智杯 AI WEB 开发挑战赛
      </footer>
    </div>
  )
}

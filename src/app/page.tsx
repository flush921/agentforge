import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-text-primary">
      <section className="w-full max-w-xl rounded-2xl border border-border bg-panel p-10 text-center shadow-2xl shadow-black/20 sm:p-14">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">AgentForge</h1>
        <p className="mt-4 text-base text-text-secondary sm:text-lg">
          一句话生成你的专属 AI 助手（开发中）
        </p>
        <Button className="mt-8" disabled>
          开发中
        </Button>
      </section>
    </main>
  )
}

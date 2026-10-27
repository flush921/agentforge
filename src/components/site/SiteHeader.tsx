import Link from 'next/link'
import { Workflow } from 'lucide-react'

export function SiteHeader({ libraryHref = '/#library' }: { libraryHref?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1160px] items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label="AgentForge 首页"
        >
          <span className="relative flex size-9 items-center justify-center rounded-xl border border-brand/40 bg-brand/10 text-brand shadow-[0_0_20px_-4px_var(--brand)] transition-shadow group-hover:shadow-[0_0_28px_-2px_var(--brand)]">
            <Workflow className="size-5" aria-hidden />
          </span>
          <span className="text-base font-semibold tracking-tight text-text-primary">
            Agent<span className="text-brand">Forge</span>
          </span>
          <span className="hidden rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted sm:inline">
            by AdAstra
          </span>
        </Link>
        <Link
          href={libraryHref}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-text-secondary transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Agent 库
        </Link>
      </div>
    </header>
  )
}

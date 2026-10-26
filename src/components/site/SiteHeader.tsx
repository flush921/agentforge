import Link from 'next/link'
import { Workflow } from 'lucide-react'

export function SiteHeader({ libraryHref = '/#library' }: { libraryHref?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1080px] items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label="AgentForge 首页"
        >
          <span className="flex size-9 items-center justify-center rounded-xl border border-brand/30 bg-brand/10 text-brand">
            <Workflow className="size-5" aria-hidden />
          </span>
          <span className="text-base font-semibold tracking-tight text-text-primary">
            AgentForge
          </span>
        </Link>
        <Link
          href={libraryHref}
          className="rounded-lg border border-border bg-panel px-3 py-2 text-xs text-text-secondary transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Agent 库
        </Link>
      </div>
    </header>
  )
}

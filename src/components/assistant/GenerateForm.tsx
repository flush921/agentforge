'use client'

import { useRef } from 'react'
import { Loader2, Sparkles, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const examples = [
  '考研择校顾问，帮我对比院校和制定备考计划',
  '健康饮食助手，根据我的作息给出食谱建议',
  '销售数据分析师，帮我解读报表并给出结论',
  '编程助教，帮我讲解代码并指出问题',
]

export function GenerateForm({
  prompt,
  onPromptChange,
  onGenerate,
  generating,
  error,
}: {
  prompt: string
  onPromptChange: (value: string) => void
  onGenerate: (prompt: string) => void
  generating: boolean
  error: string | null
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const empty = prompt.trim().length === 0

  function submit() {
    if (!empty && !generating) onGenerate(prompt)
  }

  return (
    <section aria-label="生成 Agent">
      <form
        aria-busy={generating}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="spotlight glass-panel rounded-3xl p-4 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="assistant-prompt" className="text-sm font-medium text-text-primary">
            描述你想要的 Agent
          </label>
          <span className="font-mono text-[10px] tracking-wider text-ink-muted">
            STEP 01 · GENERATE
          </span>
        </div>
        <Textarea
          ref={textareaRef}
          id="assistant-prompt"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              (event.ctrlKey || event.metaKey) &&
              event.key === 'Enter' &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder="例如：帮我做一个考研择校顾问"
          maxLength={300}
          rows={3}
          disabled={generating}
          aria-describedby="assistant-prompt-count"
          className="mt-3 max-h-64 min-h-24 resize-y border-white/10 bg-background/70 text-[15px] leading-6 transition-shadow focus-visible:shadow-[0_0_0_1px_var(--brand),0_0_24px_-6px_var(--brand)]"
        />
        <div id="assistant-prompt-count" className="mt-1.5 text-right text-[11px] text-ink-muted">
          {prompt.length}/300
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="示例描述">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              disabled={generating}
              onClick={() => {
                onPromptChange(example)
                textareaRef.current?.focus()
              }}
              className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left text-[11px] text-text-secondary transition-colors hover:border-brand/40 hover:bg-brand/[0.06] hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-ink-muted">
            <kbd className="font-sans">Ctrl / ⌘</kbd> + <kbd className="font-sans">Enter</kbd>
            <span className="ml-1.5">快速生成</span>
          </span>
          <Button
            type="submit"
            size="lg"
            disabled={empty || generating}
            className="glow-button h-10 min-w-36 rounded-xl px-5"
          >
            {generating ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Sparkles aria-hidden />
            )}
            {generating ? '正在设计…' : '生成 Agent'}
          </Button>
        </div>
      </form>
      {error !== null ? (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{error}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={generating || empty}
            onClick={submit}
          >
            重试
          </Button>
        </div>
      ) : null}
    </section>
  )
}

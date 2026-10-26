'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TriangleAlert } from 'lucide-react'
import { AssistantCard } from '@/components/assistant/AssistantCard'
import { AssistantPreview } from '@/components/assistant/AssistantPreview'
import { GenerateForm } from '@/components/assistant/GenerateForm'
import { Skeleton } from '@/components/ui/skeleton'
import { draftToSpec } from '@/lib/assistant/create-spec'
import { generateAssistant } from '@/lib/client/api'
import type { AssistantDraft, AssistantSpec } from '@/lib/contracts/assistant'
import { PRESET_ASSISTANTS } from '@/lib/fixtures/preset-assistants'
import { ApiRequestError } from '@/lib/orchestrator/http-deps'
import { deleteAssistant, listAssistants, saveAssistant } from '@/lib/storage/assistants'

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  )
}

export function HomeClient() {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<AssistantDraft | null>(null)
  const [sourcePrompt, setSourcePrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [assistants, setAssistants] = useState<AssistantSpec[]>([])
  const [loading, setLoading] = useState(true)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    listAssistants()
      .then((records) => {
        if (active) setAssistants(records)
      })
      .catch(() => {
        if (active) setStorageError('浏览器存储不可用，Agent 将无法保存')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => () => controllerRef.current?.abort(), [])

  useEffect(() => {
    if (draft === null) return
    const frame = requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [draft])

  const generate = useCallback(async (input: string) => {
    const nextPrompt = input.trim()
    if (nextPrompt.length === 0 || controllerRef.current !== null) return
    const controller = new AbortController()
    controllerRef.current = controller
    setGenerating(true)
    setError(null)
    setSaveError(null)
    setDraft(null)
    try {
      const result = await generateAssistant(nextPrompt, { signal: controller.signal })
      if (controller.signal.aborted) return
      setSourcePrompt(nextPrompt)
      setDraft(result)
    } catch (requestError) {
      if (controller.signal.aborted || isAbortError(requestError)) return
      if (requestError instanceof ApiRequestError) {
        setError(requestError.apiError.message)
      } else if (requestError instanceof TypeError) {
        setError('网络连接失败，请检查网络后重试')
      } else {
        setError('生成失败，请稍后重试')
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setGenerating(false)
      }
    }
  }, [])

  const save = useCallback(async () => {
    if (draft === null || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const spec = draftToSpec(draft, sourcePrompt, {
        id: crypto.randomUUID(),
        now: new Date().toISOString(),
      })
      await saveAssistant(spec)
      setAssistants((current) =>
        [spec, ...current.filter((assistant) => assistant.id !== spec.id)].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        ),
      )
      router.push(`/a/${spec.id}`)
    } catch {
      setSaveError('保存失败，请检查浏览器存储后重试')
    } finally {
      setSaving(false)
    }
  }, [draft, router, saving, sourcePrompt])

  const remove = useCallback(async (id: string) => {
    setDeletingId(id)
    setLibraryError(null)
    try {
      await deleteAssistant(id)
      setAssistants((current) => current.filter((assistant) => assistant.id !== id))
    } catch {
      setLibraryError('删除失败，请重试')
    } finally {
      setDeletingId((current) => (current === id ? null : current))
    }
  }, [])

  return (
    <>
      <GenerateForm
        prompt={prompt}
        onPromptChange={setPrompt}
        onGenerate={generate}
        generating={generating}
        error={error}
      />

      <div aria-live="polite">
        {generating ? (
          <section className="mt-5 rounded-2xl border border-border bg-panel p-5">
            <div aria-hidden className="space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-16 w-full" />
            </div>
            <p className="mt-4 text-sm text-text-secondary">正在设计角色、能力与护栏…</p>
          </section>
        ) : null}
      </div>

      {draft !== null ? (
        <div ref={previewRef} className="mt-5 scroll-mt-24">
          <AssistantPreview
            draft={draft}
            saving={saving}
            saveError={saveError}
            onSave={save}
            onRegenerate={() => void generate(sourcePrompt)}
          />
        </div>
      ) : null}

      <section id="library" aria-busy={loading} className="mt-10 scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-text-primary">{'我的 Agent'}</h2>
          {!loading && storageError === null && assistants.length === 0 ? (
            <p className="text-xs text-text-secondary">{'还没有 Agent，先在上面生成一个吧'}</p>
          ) : null}
          {!loading && assistants.length > 0 ? (
            <span className="text-xs text-ink-muted">
              {assistants.length} 个{' Agent'}
            </span>
          ) : null}
        </div>
        {storageError !== null ? (
          <p
            role="status"
            className="mt-3 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 p-3 text-xs leading-5 text-warning"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {storageError}
          </p>
        ) : null}
        {libraryError !== null ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {libraryError}
          </p>
        ) : null}
        {loading ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="hidden h-40 lg:block" />
          </div>
        ) : assistants.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assistants.map((assistant) => (
              <AssistantCard
                key={assistant.id}
                assistant={assistant}
                deleting={deletingId === assistant.id}
                onDelete={remove}
              />
            ))}
          </div>
        ) : null}

        <div className="mt-6 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-medium text-text-primary">{'示例 Agent'}</h2>
          <span className="text-[11px] text-ink-muted">同一引擎，不同能力组合</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRESET_ASSISTANTS.map((assistant) => (
            <AssistantCard key={assistant.id} assistant={assistant} preset />
          ))}
        </div>
      </section>
    </>
  )
}

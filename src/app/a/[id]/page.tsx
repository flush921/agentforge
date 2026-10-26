import { SiteHeader } from '@/components/site/SiteHeader'
import { AssistantPlaceholder } from './AssistantPlaceholder'

export default async function AssistantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <AssistantPlaceholder key={id} id={id} />
      </main>
    </div>
  )
}

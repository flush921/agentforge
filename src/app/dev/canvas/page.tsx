import type { Metadata } from 'next'
import { DevCanvasClient, type CanvasSample } from './DevCanvasClient'

export const metadata: Metadata = { title: '编排星图｜AgentForge' }

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function DevCanvasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const sample: CanvasSample = first(query.sample) === 'l0' ? 'l0' : 'l4'
  const rawT = Number(first(query.t) ?? 0)
  const initialT = Number.isFinite(rawT) && rawT >= 0 ? rawT : 0
  const autoplay = first(query.autoplay) !== '0'
  const initialCamera = first(query.camera) === 'overview' ? 'overview' : 'follow'

  return (
    <DevCanvasClient
      initialSample={sample}
      initialT={initialT}
      autoplay={autoplay}
      initialCamera={initialCamera}
    />
  )
}

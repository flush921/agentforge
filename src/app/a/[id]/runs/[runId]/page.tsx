import { ReplayClient } from './ReplayClient'

export default async function RunReplayPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>
}) {
  const { id, runId } = await params
  return <ReplayClient key={`${id}:${runId}`} assistantId={id} runId={runId} />
}

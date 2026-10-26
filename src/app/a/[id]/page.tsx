import { Workspace } from '@/components/workspace/Workspace'

export default async function AssistantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Workspace key={id} id={id} />
}

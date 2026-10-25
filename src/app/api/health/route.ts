import { getEnv } from '@/server/env'

export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ ok: true, mode: getEnv().LLM_MODE })
}

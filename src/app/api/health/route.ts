import { getEnv } from '@/server/env'

export const dynamic = 'force-dynamic'

export function GET() {
  const env = getEnv()
  return Response.json({
    ok: true,
    mode: env.LLM_MODE,
    accessRequired: env.ACCESS_CODE !== undefined,
  })
}

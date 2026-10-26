import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'
import type { Env } from './env-schema'
import { jsonError } from './http'

const UNAUTHORIZED_MESSAGE = '访问码错误或缺失'

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

export function checkAccess(request: Request, env: Pick<Env, 'ACCESS_CODE'>): Response | null {
  const accessCode = env.ACCESS_CODE
  if (accessCode === undefined) {
    return null
  }

  const provided = request.headers.get('x-access-code')
  if (provided === null) {
    return jsonError({ code: 'unauthorized', message: UNAUTHORIZED_MESSAGE }, 401)
  }

  const expectedHash = sha256(accessCode)
  const providedHash = sha256(provided)
  if (!timingSafeEqual(expectedHash, providedHash)) {
    return jsonError({ code: 'unauthorized', message: UNAUTHORIZED_MESSAGE }, 401)
  }

  return null
}

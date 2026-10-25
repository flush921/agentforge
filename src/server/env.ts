import 'server-only'

import { parseEnv, type Env } from './env-schema'

export { parseEnv }

let cachedEnv: Env | undefined

export function getEnv(): Env {
  if (cachedEnv === undefined) {
    cachedEnv = parseEnv(process.env)
  }

  return cachedEnv
}

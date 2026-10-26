import { loadEnvConfig } from '@next/env'

Object.assign(process.env, { NODE_ENV: 'production' })
loadEnvConfig(process.cwd())

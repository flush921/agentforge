import { z } from 'zod'

const envSchema = z
  .object({
    LLM_MODE: z.enum(['mock', 'live']).default('mock'),
    LLM_BASE_URL: z.url().optional(),
    LLM_API_KEY: z.string().optional(),
    LLM_MODEL: z.string().default('deepseek-flash'),
    ACCESS_CODE: z
      .string()
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_MODE !== 'live') return

    if (env.LLM_BASE_URL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['LLM_BASE_URL'],
        message: 'LLM_MODE=live 时必须提供 LLM_BASE_URL',
      })
    }
    if (!env.LLM_API_KEY?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['LLM_API_KEY'],
        message: 'LLM_MODE=live 时必须提供非空 LLM_API_KEY',
      })
    }
  })

export type Env = z.infer<typeof envSchema>

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw)

  if (!result.success) {
    const variables = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? '未知变量'))),
    ]
    throw new Error(`环境变量解析失败，请检查：${variables.join('、')}`)
  }

  return result.data
}

import { z } from 'zod'

const envSchema = z
  .object({
    LLM_MODE: z.enum(['mock', 'live']).default('mock'),
    DEEPSEEK_API_KEY: z.string().optional(),
    DEEPSEEK_MODEL: z.string().default('deepseek-chat'),
    ACCESS_CODE: z
      .string()
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_MODE === 'live' && !env.DEEPSEEK_API_KEY?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEEPSEEK_API_KEY'],
        message: 'LLM_MODE=live 时必须提供非空 DEEPSEEK_API_KEY',
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

import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.live.ts'],
    setupFiles: ['./src/test/live-env.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
    maxWorkers: 1,
  },
})

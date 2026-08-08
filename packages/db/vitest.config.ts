import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Testcontainers : démarrage de Postgres compris dans le budget
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})

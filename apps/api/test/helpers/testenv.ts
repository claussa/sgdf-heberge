import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { Db } from '@repo/db'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { OutgoingEmail } from '../../src/lib/email'

export interface TestEnv {
  container: StartedPostgreSqlContainer
  db: Db
  app: typeof import('../../src/app')['app']
  outbox: OutgoingEmail[]
  stop: () => Promise<void>
}

/**
 * Monte une API complète sur une Postgres Testcontainers, driver email `memory`.
 * L'env est posé AVANT tout import applicatif (le sel du blind index est lu à la
 * création de l'extension Prisma).
 */
export async function startTestEnv(): Promise<TestEnv> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start()
  const url = container.getConnectionUri()

  process.env.NODE_ENV = 'test'
  process.env.PORT = '0'
  process.env.DATABASE_URL = url
  process.env.PRISMA_FIELD_ENCRYPTION_KEY = `k1.aesgcm256.${randomBytes(32).toString('base64url')}`
  process.env.PRISMA_FIELD_ENCRYPTION_HASH_SALT = randomBytes(32).toString('hex')
  process.env.EMAIL_DRIVER = 'memory'
  process.env.EMAIL_FROM = 'Test <test@example.org>'
  process.env.APP_ORIGIN = 'http://localhost:5173'

  execSync('pnpm exec prisma db push --skip-generate', {
    cwd: fileURLToPath(new URL('../../../../packages/db', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })

  const { createPrismaClient } = await import('@repo/db')
  const db = createPrismaClient({ databaseUrl: url })

  const { setDb } = await import('../../src/lib/prisma')
  setDb(db)
  const { resetEnvCache } = await import('../../src/env')
  resetEnvCache()

  const { app } = await import('../../src/app')
  const { getMemoryOutbox } = await import('../../src/lib/email')

  return {
    container,
    db,
    app,
    outbox: getMemoryOutbox(),
    stop: async () => {
      await db.$disconnect()
      await container.stop()
    },
  }
}

/** Réinitialise les limiteurs (module-level) entre les tests. */
export async function resetRateLimiters(): Promise<void> {
  const { ipLimiter, emailLimiter } = await import('../../src/routes/auth')
  ipLimiter.reset()
  emailLimiter.reset()
}

export function extractToken(email: OutgoingEmail): string {
  const match = email.text.match(/token=([A-Za-z0-9_-]+)/)
  if (!match?.[1]) throw new Error('token absent de l’email')
  return match[1]
}

export function sessionCookieOf(res: Response): string {
  const setCookie = res.headers.get('set-cookie')
  const match = setCookie?.match(/adherents_session=([^;]+)/)
  if (!match?.[1]) throw new Error('cookie de session absent')
  return `adherents_session=${match[1]}`
}

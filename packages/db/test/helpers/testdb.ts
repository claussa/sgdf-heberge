import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { createPrismaClient, type Db } from '../../src/client'

export interface TestDb {
  container: StartedPostgreSqlContainer
  /** Client applicatif : extension de chiffrement active */
  db: Db
  /** Client NU, sans extension — uniquement pour vérifier le stockage brut (§10) */
  rawDb: PrismaClient
  encryptionKey: string
  hashSalt: string
  stop: () => Promise<void>
}

export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start()
  const url = container.getConnectionUri()

  const encryptionKey = `k1.aesgcm256.${randomBytes(32).toString('base64url')}`
  const hashSalt = randomBytes(32).toString('hex')
  // Le sel du blind index est lu par l'extension au moment de sa création.
  process.env.PRISMA_FIELD_ENCRYPTION_HASH_SALT = hashSalt

  execSync('pnpm exec prisma db push --skip-generate', {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })

  const db = createPrismaClient({ databaseUrl: url, encryptionKey })
  const rawDb = new PrismaClient({ datasourceUrl: url })

  return {
    container,
    db,
    rawDb,
    encryptionKey,
    hashSalt,
    stop: async () => {
      await db.$disconnect()
      await rawDb.$disconnect()
      await container.stop()
    },
  }
}

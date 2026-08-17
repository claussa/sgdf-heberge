/**
 * Purge COMPLÈTE de la base : TRUNCATE de toutes les tables du schéma public,
 * sauf `_prisma_migrations` (les migrations restent appliquées, re-seed possible
 * immédiatement). Aucune donnée n'est lue — pas de contact avec les champs
 * chiffrés, donc pas besoin des clés de chiffrement dans l'env.
 *
 * Garde-fous :
 * - la cible (hôte + base) est affichée avant toute action ;
 * - un hôte non local est refusé sans le flag --force (procédure de fin de run) ;
 * - confirmation en tapant le nom de la base, sauf flag --yes.
 *
 * Usage : pnpm --filter @repo/db db:purge [--yes] [--force]
 */
import { createInterface } from 'node:readline/promises'
import { PrismaClient } from '@prisma/client'

const args = process.argv.slice(2)
const skipConfirm = args.includes('--yes')
const force = args.includes('--force')

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL absent de l’environnement.')
  process.exit(1)
}

const url = new URL(databaseUrl)
const dbName = url.pathname.replace(/^\//, '')
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)

console.info(`Cible : ${url.hostname}:${url.port || '5432'} / base « ${dbName} »`)

if (!isLocal && !force) {
  console.error('Hôte non local — purge refusée. Relancer avec --force si c’est bien voulu.')
  process.exit(1)
}

if (!skipConfirm) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(
    `⚠️  Toutes les données seront détruites. Taper le nom de la base (${dbName}) pour confirmer : `,
  )
  rl.close()
  if (answer.trim() !== dbName) {
    console.error('Confirmation invalide, abandon.')
    process.exit(1)
  }
}

// Client nu, sans extension de chiffrement : TRUNCATE ne lit aucune donnée.
const db = new PrismaClient({ log: ['warn', 'error'] })

const tables = await db.$queryRaw<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
`

if (tables.length === 0) {
  console.info('Aucune table à purger (migrations non appliquées ?).')
} else {
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ')
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
  console.info(`${tables.length} tables purgées : ${tables.map((t) => t.tablename).join(', ')}`)
}

await db.$disconnect()

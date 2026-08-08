#!/usr/bin/env node
/**
 * Génère les fichiers .env locaux (gitignorés) avec des clés de dev fraîches.
 * - Clé de chiffrement au format cloak `k1.aesgcm256.<base64>` (prisma-field-encryption)
 * - Sel du blind index DISTINCT de la clé de chiffrement (§6)
 * En prod, ces valeurs viennent de Scaleway Secret Manager, jamais d'un fichier.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

// Format cloak : k1.aesgcm256.<base64url 43 chars> (regex de @47ng/cloak)
const encryptionKey = `k1.aesgcm256.${randomBytes(32).toString('base64url')}`
const hashSalt = randomBytes(32).toString('hex')

const DATABASE_URL =
  'postgresql://app:app@localhost:5433/heberge?connection_limit=10&pool_timeout=20'

// Secret d'appel du job quotidien (POST /api/internal/jobs/daily, cron Scaleway en prod)
const jobSecret = randomBytes(24).toString('base64url')

const files = {
  'packages/db/.env': `# Généré par scripts/setup-env.mjs — NE PAS COMMITTER
DATABASE_URL="${DATABASE_URL}"
PRISMA_FIELD_ENCRYPTION_KEY="${encryptionKey}"
PRISMA_FIELD_ENCRYPTION_HASH_SALT="${hashSalt}"
`,
  'apps/api/.env': `# Généré par scripts/setup-env.mjs — NE PAS COMMITTER
NODE_ENV=development
PORT=3001
DATABASE_URL="${DATABASE_URL}"
PRISMA_FIELD_ENCRYPTION_KEY="${encryptionKey}"
PRISMA_FIELD_ENCRYPTION_HASH_SALT="${hashSalt}"
# En dev : les emails sont écrits dans .local/outbox/ (jamais envoyés, jamais loggés)
EMAIL_DRIVER=devfile
EMAIL_FROM="Connexion <auth@example.org>"
# RESEND_API_KEY=  (requis uniquement si EMAIL_DRIVER=resend)
# RESEND_WEBHOOK_SECRET=  (signature svix des webhooks Resend)
APP_ORIGIN=http://localhost:5173
JOB_SECRET="${jobSecret}"
`,
}

let wrote = 0
for (const [rel, content] of Object.entries(files)) {
  const path = resolve(root, rel)
  if (existsSync(path)) {
    console.info(`— ${rel} existe déjà, non modifié`)
    continue
  }
  writeFileSync(path, content)
  console.info(`✓ ${rel} créé`)
  wrote++
}
if (wrote > 0) {
  console.info('\nClés de dev générées. En prod : Scaleway Secret Manager (§3, §9).')
}

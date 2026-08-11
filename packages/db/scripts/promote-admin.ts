/**
 * Promotion d'un compte en ADMIN à partir de son email (plan v1 : aucune UI de
 * promotion, role=ADMIN posé en seed/SQL/script uniquement).
 *
 * Le lookup passe par le blind index emailHash via l'extension de chiffrement —
 * un UPDATE SQL par email est impossible (champ chiffré). Prérequis dans l'env :
 * DATABASE_URL, PRISMA_FIELD_ENCRYPTION_KEY, PRISMA_FIELD_ENCRYPTION_HASH_SALT.
 *
 * Usage : pnpm --filter @repo/db db:promote-admin <email>
 */
import { createPrismaClient } from '../src/client'
import { normalizeEmail } from '../src/normalize'

const input = process.argv[2]
if (!input) {
  console.error('Usage: pnpm db:promote-admin <email>')
  process.exit(1)
}

const db = createPrismaClient()
const email = normalizeEmail(input)

// §7 — jamais l'email dans la sortie, uniquement l'ID.
const user = await db.user.findFirst({ where: { email }, select: { id: true, role: true } })
if (!user) {
  console.error('Aucun compte pour cet email (la personne doit se connecter une première fois).')
  process.exit(1)
}
if (user.role === 'ADMIN') {
  console.info(`Déjà ADMIN — user ${user.id}, rien à faire.`)
} else {
  await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } })
  console.info(`role=ADMIN posé sur user ${user.id}.`)
}
await db.$disconnect()

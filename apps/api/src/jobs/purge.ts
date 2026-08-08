/**
 * Job de purge — politique de rétention (§6), même pour un run de 2 mois.
 * À exécuter quotidiennement (Scaleway Serverless Job ou cron) :
 *   pnpm --filter @repo/api purge
 *
 * Rétention :
 *   - magic links : 30 jours après création (le journal d'utilisation part en cascade)
 *   - sessions expirées (glissante ou plafond absolu) : supprimées immédiatement
 *   - journaux d'utilisation restants : 90 jours (contiennent IP + user-agent = PII)
 */
import { getPrisma } from '@repo/db'
import { logger } from '../lib/logger'

const DAY_MS = 24 * 60 * 60 * 1000

export async function purge(now = new Date()) {
  const db = getPrisma()

  const tokens = await db.magicLinkToken.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 30 * DAY_MS) } },
  })
  const sessions = await db.session.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { absoluteExpiresAt: { lt: now } }],
    },
  })
  const usages = await db.magicLinkUsage.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 90 * DAY_MS) } },
  })

  logger.info(
    {
      deletedTokens: tokens.count,
      deletedSessions: sessions.count,
      deletedUsages: usages.count,
    },
    'purge terminée',
  )
  return { tokens: tokens.count, sessions: sessions.count, usages: usages.count }
}

if (process.argv[1]?.endsWith('purge.ts') || process.argv[1]?.endsWith('purge.js')) {
  purge()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}

import { createHash, timingSafeEqual } from 'node:crypto'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { ErrorResponseSchema, OkResponseSchema } from '@repo/contracts'
import { getEnv } from '../env'
import { AppError } from '../errors'
import { runDailyJob } from '../jobs/daily'
import type { AuthVariables } from '../middleware/auth'

/**
 * Routes d'infrastructure — pas de session utilisateur : l'appelant est le cron
 * Scaleway, authentifié par le header `x-job-secret` (secret d'infra, Secret
 * Manager côté Terraform). JOB_SECRET absent de l'env → 401 systématique :
 * jamais de mode « ouvert » par accident.
 */

/** Comparaison en temps constant sur les empreintes (ni timing ni longueur ne fuient). */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

const dailyJobRoute = createRoute({
  method: 'post',
  path: '/internal/jobs/daily',
  tags: ['internal'],
  summary: 'Déclencher le job quotidien (cron)',
  description:
    'Expiration des demandes, masquage des logements inactifs, relances, purge des ' +
    'comptes coquilles, re-sync des capacités, purge de rétention. Idempotent : ' +
    'relançable sans double transition ni double email. Protégé par le header x-job-secret.',
  responses: {
    200: {
      description: 'Job exécuté',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    401: {
      description: 'Secret absent ou invalide',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

export const internalRouter = new OpenAPIHono<{ Variables: AuthVariables }>().openapi(
  dailyJobRoute,
  async (c) => {
    const expected = getEnv().JOB_SECRET
    const provided = c.req.header('x-job-secret')
    if (!expected || !provided || !secretMatches(provided, expected)) {
      throw new AppError('UNAUTHORIZED', 'Secret de job invalide')
    }
    await runDailyJob()
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  },
)

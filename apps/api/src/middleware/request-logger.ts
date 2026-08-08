import { createMiddleware } from 'hono/factory'
import { logger } from '../lib/logger'

/**
 * §7 — on logge méthode, chemin (SANS query string : le token du magic link
 * transite en query), statut, durée et un requestId. Jamais de body.
 */
export const requestLogger = createMiddleware<{ Variables: { requestId: string } }>(
  async (c, next) => {
    const requestId = crypto.randomUUID()
    c.set('requestId', requestId)
    const start = performance.now()
    await next()
    logger.info(
      {
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - start),
      },
      'request',
    )
  },
)

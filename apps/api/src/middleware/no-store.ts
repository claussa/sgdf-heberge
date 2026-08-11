import { createMiddleware } from 'hono/factory'

/**
 * Cache-Control: no-store sur toutes les réponses /api.
 *
 * Le cache Edge Services est GLOBAL au pipeline et placé AVANT le routage
 * (infra/frontend.tf) : seul fallback_ttl = 0 empêche la mise en cache des
 * réponses API. Ce middleware est la ceinture de sécurité applicative — les
 * réponses contiennent des PII (§5), elles ne doivent être cachables nulle
 * part, quel que soit le réglage du CDN.
 */
export const noStore = createMiddleware(async (c, next) => {
  await next()
  if (!c.res.headers.has('Cache-Control')) {
    c.res.headers.set('Cache-Control', 'no-store')
  }
})

import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { getEnv } from './env'
import { handleError } from './errors'
import { noStore } from './middleware/no-store'
import { requestLogger } from './middleware/request-logger'
import { adminRouter } from './routes/admin'
import { authRouter } from './routes/auth'
import { healthRouter } from './routes/health'
import { internalRouter } from './routes/internal'
import { jumelageRouter } from './routes/jumelage'
import { listingsRouter } from './routes/listings'
import { meRouter } from './routes/me'
import { requestsRouter } from './routes/requests'
import { webhooksRouter } from './routes/webhooks'

/**
 * Hook par défaut : erreurs de validation Zod → format d'erreur unique (§5).
 */
const api = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR' as const, message: 'Requête invalide' } },
        400,
      )
    }
  },
})

api.use(requestLogger)
api.use(secureHeaders())
api.use(noStore)
api.use(
  cors({
    // §9 — CORS restreint à l'origine de la SPA. En prod, SPA et API partagent le
    // même domaine (SameSite=Lax, §9) : CORS ne sert qu'aux outils externes.
    origin: (origin) => (origin === getEnv().APP_ORIGIN ? origin : undefined),
    credentials: true,
  }),
)
api.onError(handleError)

// Chaîne unique : le type accumulé est la source du RPC Hono côté SPA (§5).
// ⚠️ Les routers sont branchés ICI et uniquement ici — un router non chaîné
// n'existe ni pour le RPC ni pour l'OpenAPI.
const routes = api
  .route('/', healthRouter)
  .route('/', authRouter)
  .route('/', meRouter)
  .route('/', listingsRouter)
  .route('/', requestsRouter)
  .route('/', jumelageRouter)
  .route('/', adminRouter)
  .route('/', internalRouter)
  .route('/', webhooksRouter)

api.doc31('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'API plateforme hébergement',
    version: '1.0.0',
    description:
      "API de mise en relation pour l'hébergement des bénévoles (logements de particuliers, " +
      'institutionnels, jumelage entre unités). Authentification par magic link, session en ' +
      'cookie httpOnly.',
  },
})

// Doc interactive pour les consommateurs externes (§2).
api.get('/docs', Scalar({ url: '/api/openapi.json' }))

/**
 * Le seul export consommé par apps/web, en `import type` uniquement (§4).
 * Les chemins n'incluent pas /api : le client fait `hc<AppType>('/api')` (§5).
 */
export type AppType = typeof routes

/** App racine : tout est servi sous /api (même site que la SPA via Edge Services, §9). */
export const app = new Hono().route('/api', api)

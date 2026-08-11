import { serve } from '@hono/node-server'
import { app } from './app'
import { getEnv } from './env'
import { shutdownAnalytics } from './lib/analytics'
import { logger } from './lib/logger'
import { getDb } from './lib/prisma'

const env = getEnv()

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, 'API démarrée')
})

// Arrêt propre : Scaleway Serverless Container envoie SIGTERM avant de tuer l'instance.
// Sortie forcée après 3 s : server.close() attend sinon les connexions keep-alive.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'arrêt en cours')
    setTimeout(() => process.exit(0), 3000).unref()
    server.close(async () => {
      // Flush PostHog avant de mourir : les events partent par batch, pas à l'unité.
      await shutdownAnalytics().catch(() => {})
      await getDb().$disconnect()
      process.exit(0)
    })
  })
}

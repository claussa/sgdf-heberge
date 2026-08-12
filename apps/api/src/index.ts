import { serve } from '@hono/node-server'
import { app } from './app'
import { getEnv } from './env'
import { captureServerException, shutdownAnalytics } from './lib/analytics'
import { logger } from './lib/logger'
import { getDb } from './lib/prisma'

const env = getEnv()

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, 'API démarrée')
})

// Crash hors requête HTTP : le onError de Hono ne couvre que le chemin des requêtes.
// On capture, on flush (les events PostHog partent par batch), puis on laisse mourir
// l'instance — Scaleway en redémarre une propre. Sortie forcée après 3 s si le flush pend.
for (const event of ['uncaughtException', 'unhandledRejection'] as const) {
  process.on(event, (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    logger.fatal({ err: { name: error.name, message: error.message }, event }, 'crash process')
    captureServerException(error, { path: `process:${event}` })
    setTimeout(() => process.exit(1), 3000).unref()
    shutdownAnalytics()
      .catch(() => {})
      .finally(() => process.exit(1))
  })
}

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

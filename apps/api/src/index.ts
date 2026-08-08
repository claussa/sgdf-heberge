import { serve } from '@hono/node-server'
import { app } from './app'
import { getEnv } from './env'
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
      await getDb().$disconnect()
      process.exit(0)
    })
  })
}

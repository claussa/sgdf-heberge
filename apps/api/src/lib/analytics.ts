import { PostHog } from 'posthog-node'
import { getEnv } from '../env'
import { logger } from './logger'

/**
 * Télémétrie produit + erreurs serveur via PostHog Cloud EU. Périmètre volontairement
 * minimal (§7 s'applique aux events comme aux logs) :
 * - distinctId : TOUJOURS un ID interne, jamais un email ni une autre PII.
 * - properties : jamais de PII, jamais de token, jamais de body de requête.
 * - Sans POSTHOG_API_KEY, tout est un no-op — dev et tests ne télémètrent rien.
 */

let client: PostHog | null | undefined

function getPosthog(): PostHog | null {
  if (client === undefined) {
    const env = getEnv()
    client = env.POSTHOG_API_KEY
      ? new PostHog(env.POSTHOG_API_KEY, { host: env.POSTHOG_HOST })
      : null
  }
  return client
}

export function captureServerEvent(
  event: string,
  distinctId: string,
  properties?: Record<string, string | number | boolean>,
): void {
  try {
    getPosthog()?.capture({ distinctId, event, properties })
  } catch (error) {
    // La télémétrie ne doit jamais faire échouer une requête.
    logger.warn({ err: { name: (error as Error).name } }, 'échec capture PostHog')
  }
}

/**
 * Erreur serveur non gérée. Le message et la stack partent chez PostHog : même
 * exigence que pour pino — aucune valeur utilisateur dans les messages d'erreur.
 */
export function captureServerException(error: Error, context?: { path?: string }): void {
  try {
    getPosthog()?.captureException(
      error,
      undefined,
      context?.path ? { path: context.path } : undefined,
    )
  } catch {
    // no-op : voir ci-dessus
  }
}

/** À appeler à l'arrêt (SIGTERM) : flush du batch en attente avant la mort de l'instance. */
export async function shutdownAnalytics(): Promise<void> {
  if (client) await client.shutdown()
}

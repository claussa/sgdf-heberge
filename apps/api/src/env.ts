import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // 3001 partout : .env, Dockerfile, containers.tf, proxy Vite — le défaut du code doit suivre
  PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.string().min(1),
  PRISMA_FIELD_ENCRYPTION_KEY: z.string().startsWith('k1.aesgcm256.'),
  /** Sel du blind index — DISTINCT de la clé de chiffrement (§6) */
  PRISMA_FIELD_ENCRYPTION_HASH_SALT: z.string().min(16),
  /** resend en prod ; devfile écrit dans .local/outbox ; memory pour les tests */
  EMAIL_DRIVER: z.enum(['resend', 'devfile', 'memory']).default('devfile'),
  EMAIL_FROM: z.string().min(3),
  /** Reply-To des emails sortants — l'expéditeur no-reply ne reçoit rien */
  EMAIL_REPLY_TO: z.string().min(3).optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  /** Origine de la SPA — CORS restreint (§9) et base des magic links */
  APP_ORIGIN: z.url().default('http://localhost:5173'),
  /** Secret d'appel de POST /internal/jobs/daily (cron Scaleway) */
  JOB_SECRET: z.string().min(10).optional(),
  /**
   * PostHog Cloud EU — événements produit + erreurs serveur. Optionnel : sans clé,
   * toute la télémétrie est un no-op (dev, tests). La clé de projet n'est pas un
   * secret au sens strict (elle est de toute façon publique dans le bundle front).
   */
  POSTHOG_API_KEY: z.string().optional(),
  /** Impérativement l'endpoint UE — les données ne doivent pas transiter hors UE */
  POSTHOG_HOST: z.url().default('https://eu.i.posthog.com'),
})

export type Env = z.infer<typeof EnvSchema>

let cached: Env | undefined

export function getEnv(): Env {
  if (cached) return cached
  const env = EnvSchema.parse(process.env)
  if (env.NODE_ENV === 'production') {
    // §8 — en prod, pas d'échappatoire : les emails partent par Resend, point.
    if (env.EMAIL_DRIVER !== 'resend' || !env.RESEND_API_KEY) {
      throw new Error('En production, EMAIL_DRIVER=resend et RESEND_API_KEY sont obligatoires')
    }
    if (!env.JOB_SECRET) {
      throw new Error('En production, JOB_SECRET est obligatoire (cron du job quotidien)')
    }
  }
  cached = env
  return cached
}

/** Réservé aux tests : force une relecture de process.env. */
export function resetEnvCache(): void {
  cached = undefined
}

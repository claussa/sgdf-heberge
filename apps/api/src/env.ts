import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1),
  PRISMA_FIELD_ENCRYPTION_KEY: z.string().startsWith('k1.aesgcm256.'),
  /** Sel du blind index — DISTINCT de la clé de chiffrement (§6) */
  PRISMA_FIELD_ENCRYPTION_HASH_SALT: z.string().min(16),
  /** resend en prod ; devfile écrit dans .local/outbox ; memory pour les tests */
  EMAIL_DRIVER: z.enum(['resend', 'devfile', 'memory']).default('devfile'),
  EMAIL_FROM: z.string().min(3),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  /** Origine de la SPA — CORS restreint (§9) et base des magic links */
  APP_ORIGIN: z.url().default('http://localhost:5173'),
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
  }
  cached = env
  return cached
}

/** Réservé aux tests : force une relecture de process.env. */
export function resetEnvCache(): void {
  cached = undefined
}

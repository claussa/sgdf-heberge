import { createRequire } from 'node:module'
import { pino } from 'pino'

/**
 * §7 — POINT CRITIQUE.
 * Logs JSON structurés, liste de champs redactés EN DUR.
 * Jamais de body de requête complet, jamais d'email en identifiant (IDs uniquement),
 * jamais le token d'un magic link ni son URL.
 */
const REDACTED_PATHS = [
  'email',
  '*.email',
  '*.*.email',
  'phone',
  '*.phone',
  'address',
  '*.address',
  'birthDate',
  '*.birthDate',
  'firstName',
  '*.firstName',
  'lastName',
  '*.lastName',
  'token',
  '*.token',
  'url',
  '*.url',
  'magicLink',
  '*.magicLink',
  'cookie',
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
]

const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'

/** pino-pretty est une devDependency : absente du bundle de prod, même si NODE_ENV≠production. */
function prettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty')
    return true
  } catch {
    return false
  }
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
  ...(isDev && prettyAvailable()
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
})

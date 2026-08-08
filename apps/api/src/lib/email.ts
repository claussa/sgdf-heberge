import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Resend } from 'resend'
import { getEnv } from '../env'
import { logger } from './logger'

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text: string
  /** Idempotency key Resend (§8) — évite les doublons en cas de retry */
  idempotencyKey?: string
}

export interface EmailDriver {
  send(email: OutgoingEmail): Promise<void>
}

/** Production : Resend, région UE + DPA signé (§8). Envoi SYNCHRONE pour les mails d'auth. */
class ResendDriver implements EmailDriver {
  private client: Resend
  private from: string

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey)
    this.from = from
  }

  async send(email: OutgoingEmail): Promise<void> {
    const { error } = await this.client.emails.send(
      {
        from: this.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
      email.idempotencyKey ? { idempotencyKey: email.idempotencyKey } : undefined,
    )
    if (error) {
      // §8 — une erreur Resend est une alerte de disponibilité de l'authentification.
      // On logge le type d'erreur, jamais le destinataire ni le contenu.
      throw new Error(`Échec d'envoi Resend: ${error.name}`)
    }
  }
}

/**
 * Dev local uniquement : écrit l'email dans .local/outbox/ (gitignoré).
 * Le magic link n'apparaît ainsi JAMAIS dans les logs (§8).
 */
class DevFileDriver implements EmailDriver {
  private dir = join(process.cwd(), '.local', 'outbox')

  async send(email: OutgoingEmail): Promise<void> {
    mkdirSync(this.dir, { recursive: true })
    const file = join(this.dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`)
    writeFileSync(file, JSON.stringify(email, null, 2))
    logger.info({ driver: 'devfile' }, 'email écrit dans .local/outbox')
  }
}

/** Tests : capture en mémoire. */
class MemoryDriver implements EmailDriver {
  readonly outbox: OutgoingEmail[] = []

  async send(email: OutgoingEmail): Promise<void> {
    this.outbox.push(email)
  }
}

const memoryDriver = new MemoryDriver()

/** Réservé aux tests : accès aux emails capturés par le driver `memory`. */
export function getMemoryOutbox(): OutgoingEmail[] {
  return memoryDriver.outbox
}

let driver: EmailDriver | undefined

export function getEmailDriver(): EmailDriver {
  if (driver) return driver
  const env = getEnv()
  switch (env.EMAIL_DRIVER) {
    case 'resend':
      if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY manquante')
      driver = new ResendDriver(env.RESEND_API_KEY, env.EMAIL_FROM)
      break
    case 'devfile':
      driver = new DevFileDriver()
      break
    case 'memory':
      driver = memoryDriver
      break
  }
  return driver
}

import { getEmailDriver, type OutgoingEmail } from '../lib/email'
import { logger } from '../lib/logger'

export interface EmailRecipient {
  email: string
  emailStatus: 'OK' | 'BOUNCED' | 'COMPLAINED'
}

/**
 * Point de passage UNIQUE des notifications (§8) : ne JAMAIS envoyer vers une adresse
 * en bounce ou en plainte — chaque adresse pourrie ne doit bouncer qu'une fois,
 * la réputation d'envoi est la disponibilité de l'authentification.
 * Jamais de PII en log (ni adresse, ni contenu).
 */
export async function sendToRecipient(
  recipient: EmailRecipient,
  message: Omit<OutgoingEmail, 'to'>,
): Promise<void> {
  if (recipient.emailStatus !== 'OK') {
    logger.info({ reason: recipient.emailStatus }, 'notification non envoyée : adresse marquée')
    return
  }
  await getEmailDriver().send({ ...message, to: recipient.email })
}

/**
 * Variante fire-and-forget pour les notifications émises APRÈS un commit de
 * transaction (jamais d'envoi DANS une transaction) : l'échec est loggé, jamais
 * propagé au handler HTTP.
 */
export function sendToRecipientAsync(
  recipient: EmailRecipient,
  message: Omit<OutgoingEmail, 'to'>,
): void {
  sendToRecipient(recipient, message).catch((error: Error) => {
    logger.error({ err: { name: error.name, message: error.message } }, 'échec envoi notification')
  })
}

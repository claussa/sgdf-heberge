import { createHmac, timingSafeEqual } from 'node:crypto'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { OkResponseSchema } from '@repo/contracts'
import { z } from 'zod'
import { getEnv } from '../env'
import { logger } from '../lib/logger'
import { getDb } from '../lib/prisma'
import { markEmailStatus } from '../services/user-service'

/**
 * Webhooks Resend (§8) : bounces et complaints marquent l'adresse en base.
 * Continuer à envoyer sur des adresses qui bouncent dégrade la réputation d'envoi.
 * Signature au format svix (en-têtes svix-id / svix-timestamp / svix-signature).
 */

const WebhookEventSchema = z.object({
  type: z.string(),
  data: z.object({
    to: z.union([z.string(), z.array(z.string())]).optional(),
  }),
})

const TIMESTAMP_TOLERANCE_S = 5 * 60

export function verifySvixSignature(input: {
  secret: string
  id: string
  timestamp: string
  signature: string
  payload: string
  nowS?: number
}): boolean {
  const nowS = input.nowS ?? Math.floor(Date.now() / 1000)
  const ts = Number.parseInt(input.timestamp, 10)
  if (!Number.isFinite(ts) || Math.abs(nowS - ts) > TIMESTAMP_TOLERANCE_S) return false

  const secret = Buffer.from(input.secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', secret)
    .update(`${input.id}.${input.timestamp}.${input.payload}`)
    .digest('base64')
  const expectedBuffer = Buffer.from(expected)

  return input.signature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',')
    if (version !== 'v1' || !sig) return false
    const candidate = Buffer.from(sig)
    return candidate.length === expectedBuffer.length && timingSafeEqual(candidate, expectedBuffer)
  })
}

const resendWebhookRoute = createRoute({
  method: 'post',
  path: '/webhooks/resend',
  tags: ['webhooks'],
  summary: 'Webhooks Resend (bounces, complaints)',
  responses: {
    200: {
      description: 'Événement traité',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    401: { description: 'Signature invalide' },
  },
})

export const webhooksRouter = new OpenAPIHono().openapi(resendWebhookRoute, async (c) => {
  const env = getEnv()
  const payload = await c.req.text()

  if (env.RESEND_WEBHOOK_SECRET) {
    const verified = verifySvixSignature({
      secret: env.RESEND_WEBHOOK_SECRET,
      id: c.req.header('svix-id') ?? '',
      timestamp: c.req.header('svix-timestamp') ?? '',
      signature: c.req.header('svix-signature') ?? '',
      payload,
    })
    if (!verified) {
      return c.body(null, 401)
    }
  } else if (env.NODE_ENV === 'production') {
    // Pas de webhook non signé en prod.
    return c.body(null, 401)
  }

  // Un corps malformé mais correctement signé ne doit pas produire un 500.
  let json: unknown
  try {
    json = JSON.parse(payload)
  } catch {
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  }
  const parsed = WebhookEventSchema.safeParse(json)
  if (parsed.success) {
    const { type, data } = parsed.data
    const recipients = Array.isArray(data.to) ? data.to : data.to ? [data.to] : []
    if (type === 'email.bounced' || type === 'email.complained') {
      const status = type === 'email.bounced' ? 'BOUNCED' : 'COMPLAINED'
      for (const recipient of recipients) {
        await markEmailStatus(getDb(), recipient, status)
      }
      // §7 — jamais l'adresse en log, uniquement le type d'événement.
      logger.info({ eventType: type, recipientCount: recipients.length }, 'webhook resend traité')
    }
  }

  return c.json(OkResponseSchema.parse({ ok: true }), 200)
})

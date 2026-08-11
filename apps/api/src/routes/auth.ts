import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  ErrorResponseSchema,
  MagicLinkRequestResponseSchema,
  MagicLinkRequestSchema,
  OkResponseSchema,
} from '@repo/contracts'
import { normalizeEmail } from '@repo/db'
import { renderMagicLinkEmail } from '@repo/emails'
import { deleteCookie, setCookie } from 'hono/cookie'
import { getEnv } from '../env'
import { captureServerEvent, captureServerException } from '../lib/analytics'
import { logger } from '../lib/logger'
import { getDb } from '../lib/prisma'
import { type AuthVariables, requireAuth, SESSION_COOKIE } from '../middleware/auth'
import { assertWithinLimit, clientIp, RateLimiter } from '../middleware/rate-limit'
import {
  consumeMagicLink,
  createSession,
  hashToken,
  requestMagicLink,
  revokeSession,
  SESSION_ABSOLUTE_MS,
} from '../services/auth-service'
import { sendToRecipient } from '../services/notify'

// §9 — rate limiting à deux niveaux : par IP et par email. Sans ça, l'endpoint est
// un moyen gratuit d'envoyer des mails à des tiers depuis notre domaine.
// (S'y ajoute le throttle d'émission par email ADOSSÉ À LA BASE dans requestMagicLink,
// partagé entre instances.)
export const ipLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 10 })
export const emailLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 3 })

const requestMagicLinkRoute = createRoute({
  method: 'post',
  path: '/auth/magic-link',
  tags: ['auth'],
  summary: 'Demander un lien de connexion',
  description:
    "Le lien crée le compte s'il n'existe pas (« coquille » : le type est choisi à la " +
    "première connexion). Réponse strictement identique que l'email existe ou non " +
    '(anti-énumération). Le lien est valable 10 minutes.',
  request: {
    body: {
      content: { 'application/json': { schema: MagicLinkRequestSchema } },
      required: true,
    },
  },
  responses: {
    202: {
      description: 'Demande prise en compte (que le compte existe ou non)',
      content: { 'application/json': { schema: MagicLinkRequestResponseSchema } },
    },
    429: {
      description: 'Trop de demandes',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const callbackRoute = createRoute({
  method: 'get',
  path: '/auth/callback',
  tags: ['auth'],
  summary: 'Callback du magic link',
  description:
    'Pose le cookie de session puis redirige en 302 vers une URL propre : le token ' +
    "sort de la barre d'adresse et de l'historique. Referrer-Policy: no-referrer.",
  request: {
    query: z.object({ token: z.string().min(1) }),
  },
  responses: {
    302: { description: 'Redirection vers la SPA (session créée ou erreur de lien)' },
  },
})

const logoutRoute = createRoute({
  method: 'post',
  path: '/auth/logout',
  tags: ['auth'],
  summary: 'Déconnexion (révocation de la session en base)',
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Session révoquée',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    401: {
      description: 'Non authentifié',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

/**
 * Émission et envoi du lien, déclenchés APRÈS la réponse HTTP (fire-and-forget) :
 * le temps de réponse ne dépend ainsi ni de l'existence du compte ni du throttle
 * (anti-énumération §9). L'envoi est synchrone vis-à-vis de Resend (pas de file, §8).
 */
async function issueAndSendMagicLink(emailInput: string): Promise<void> {
  const env = getEnv()
  const issued = await requestMagicLink(getDb(), emailInput)
  if (!issued) return // bounce, plainte ou throttle : on ne fait rien, on ne dit rien

  const url = `${env.APP_ORIGIN}/api/auth/callback?token=${issued.token}`
  const rendered = await renderMagicLinkEmail({ firstName: issued.user.firstName, url })
  await sendToRecipient(
    { email: issued.user.email, emailStatus: 'OK' },
    {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      // Un retry du même token ne renvoie pas un doublon (§8)
      idempotencyKey: `magic-link/${hashToken(issued.token)}`,
    },
  )
  // Le pendant de magic_link_requested (capturé dans requestMagicLink) : le diff
  // entre les deux = skips (bounce/throttle) + échecs Resend. Jamais l'email en propriété.
  captureServerEvent('magic_link_sent', issued.user.id)
}

export const authRouter = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(requestMagicLinkRoute, (c) => {
    const { email } = c.req.valid('json')
    assertWithinLimit(ipLimiter, `ml:ip:${clientIp(c)}`)
    assertWithinLimit(emailLimiter, `ml:email:${normalizeEmail(email)}`)

    // Pas de await : la réponse part tout de suite, identique dans tous les cas.
    issueAndSendMagicLink(email).catch((error: Error) => {
      // §7/§8 — on logge l'échec (alerte dispo de l'auth), jamais l'email ni le lien.
      logger.error({ err: { name: error.name, message: error.message } }, 'échec envoi magic link')
      captureServerException(error, { path: '/auth/magic-link' })
    })

    return c.json(
      MagicLinkRequestResponseSchema.parse({
        ok: true,
        message: 'Le lien est parti ! Vérifie ta boîte mail : il est valable 10 minutes.',
      }),
      202,
    )
  })
  .openapi(callbackRoute, async (c) => {
    const env = getEnv()
    const { token } = c.req.valid('query')

    // §9 — pas de fuite du token dans le header Referer d'une redirection tierce.
    c.header('Referrer-Policy', 'no-referrer')

    const consumed = await consumeMagicLink(getDb(), token, {
      ip: clientIp(c),
      userAgent: c.req.header('user-agent') ?? 'unknown',
    })
    if (!consumed) {
      return c.redirect(`${env.APP_ORIGIN}/connexion?error=lien-invalide`, 302)
    }

    const sessionToken = await createSession(getDb(), consumed.userId)
    setCookie(c, SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      // Max-Age explicite (§9) : plafond absolu ; l'expiration réelle est gérée en base.
      maxAge: Math.floor(SESSION_ABSOLUTE_MS / 1000),
    })

    // 302 immédiat vers une URL propre : le token sort de l'historique (§9).
    // La SPA route ensuite selon /me (accountType null → /inscription).
    return c.redirect(`${env.APP_ORIGIN}/`, 302)
  })
  .openapi(logoutRoute, async (c) => {
    await revokeSession(getDb(), c.get('sessionToken'))
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  })

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  ErrorResponseSchema,
  MagicLinkRequestResponseSchema,
  MagicLinkRequestSchema,
  MemberSchema,
  OkResponseSchema,
} from '@repo/contracts'
import { normalizeEmail } from '@repo/db'
import { renderMagicLinkEmail } from '@repo/emails'
import { deleteCookie, setCookie } from 'hono/cookie'
import { getEnv } from '../env'
import { getEmailDriver } from '../lib/email'
import { logger } from '../lib/logger'
import { getDb } from '../lib/prisma'
import { requireAuth, SESSION_COOKIE } from '../middleware/auth'
import { assertWithinLimit, clientIp, RateLimiter } from '../middleware/rate-limit'
import {
  consumeMagicLink,
  createSession,
  hashToken,
  requestMagicLink,
  revokeSession,
  SESSION_ABSOLUTE_MS,
} from '../services/auth-service'
import { toMemberDTO } from '../services/member-service'

// §9 — rate limiting à deux niveaux : par IP et par email. Sans ça, l'endpoint est
// un moyen gratuit d'envoyer des mails à des tiers depuis notre domaine.
export const ipLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 10 })
export const emailLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 3 })

const requestMagicLinkRoute = createRoute({
  method: 'post',
  path: '/auth/magic-link',
  tags: ['auth'],
  summary: 'Demander un lien de connexion',
  description:
    "Réponse strictement identique que l'email existe ou non (anti-énumération). " +
    'Le lien est valable 10 minutes.',
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

const meRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['auth'],
  summary: "Profil de l'adhérent connecté",
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Profil',
      content: { 'application/json': { schema: MemberSchema } },
    },
    401: {
      description: 'Non authentifié',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

/**
 * Émission et envoi du lien, déclenchés APRÈS la réponse HTTP (fire-and-forget) :
 * le temps de réponse ne dépend ainsi pas de l'existence du compte (anti-énumération §9).
 * L'envoi est synchrone vis-à-vis de Resend (pas de file de masse, §8).
 */
async function issueAndSendMagicLink(emailInput: string): Promise<void> {
  const env = getEnv()
  const issued = await requestMagicLink(getDb(), emailInput)
  if (!issued) return // email inconnu : on ne fait rien, on ne dit rien

  const url = `${env.APP_ORIGIN}/api/auth/callback?token=${issued.token}`
  const rendered = await renderMagicLinkEmail({ firstName: issued.member.firstName, url })
  await getEmailDriver().send({
    to: issued.member.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    // Un retry du même token ne renvoie pas un doublon (§8)
    idempotencyKey: `magic-link/${hashToken(issued.token)}`,
  })
}

export const authRouter = new OpenAPIHono()
  .openapi(requestMagicLinkRoute, (c) => {
    const { email } = c.req.valid('json')
    assertWithinLimit(ipLimiter, `ml:ip:${clientIp(c)}`)
    assertWithinLimit(emailLimiter, `ml:email:${normalizeEmail(email)}`)

    // Pas de await : la réponse part tout de suite, identique dans tous les cas.
    issueAndSendMagicLink(email).catch((error: Error) => {
      // §7/§8 — on logge l'échec (alerte dispo de l'auth), jamais l'email ni le lien.
      logger.error({ err: { name: error.name, message: error.message } }, 'échec envoi magic link')
    })

    return c.json(
      MagicLinkRequestResponseSchema.parse({
        ok: true,
        message: 'Si un compte existe pour cette adresse, un lien de connexion a été envoyé.',
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
      return c.redirect(`${env.APP_ORIGIN}/login?error=lien-invalide`, 302)
    }

    const sessionToken = await createSession(getDb(), consumed.memberId)
    setCookie(c, SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      // Max-Age explicite (§9) : plafond absolu ; l'expiration réelle est gérée en base.
      maxAge: Math.floor(SESSION_ABSOLUTE_MS / 1000),
    })

    // 302 immédiat vers une URL propre : le token sort de l'historique (§9).
    return c.redirect(`${env.APP_ORIGIN}/`, 302)
  })
  .openapi(logoutRoute, async (c) => {
    await revokeSession(getDb(), c.get('sessionToken'))
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  })
  .openapi(meRoute, (c) => {
    // Schema.parse systématique avant c.json (§5) — filtre réel au runtime.
    return c.json(MemberSchema.parse(toMemberDTO(c.get('member'))), 200)
  })

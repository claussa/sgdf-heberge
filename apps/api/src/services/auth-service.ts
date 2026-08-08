import { createHash, randomBytes } from 'node:crypto'
import { type Db, normalizeEmail, Prisma } from '@repo/db'
import { logger } from '../lib/logger'

// ---------------------------------------------------------------------------
// Constantes (§9) — modifiables uniquement après discussion explicite
// ---------------------------------------------------------------------------

/** TTL 10 min : absorbe la latence de délivrance, limite la fenêtre de rejeu. Pas 5 min. */
export const MAGIC_LINK_TTL_MS = 10 * 60 * 1000
/** Multi-usage plafonné (décision assumée §9) : absorbe scanners d'email et doubles-clics. */
export const MAGIC_LINK_MAX_USES = 5
/**
 * Throttle d'ÉMISSION par email, adossé à la base (partagé entre instances,
 * contrairement au rate limiter mémoire) : ≥ 3 tokens créés en 15 min → skip silencieux.
 * Protège la réputation d'envoi — l'email EST l'authentification (§8).
 */
export const MAGIC_LINK_EMAIL_WINDOW_MS = 15 * 60 * 1000
export const MAGIC_LINK_EMAIL_MAX_PER_WINDOW = 3
/** Session glissante : 90 jours d'inactivité. */
export const SESSION_SLIDING_MS = 90 * 24 * 60 * 60 * 1000
/** Plafond absolu : 6 mois après création, jamais repoussé. */
export const SESSION_ABSOLUTE_MS = 180 * 24 * 60 * 60 * 1000
/** Rafraîchir l'expiration au plus une fois par 24 h (sinon une écriture par requête). */
export const SESSION_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

/** Select explicite du DTO utilisateur (§5) — jamais de findMany nu sur une table à PII. */
export const USER_DTO_SELECT = {
  id: true,
  accountType: true,
  role: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  groupSize: true,
  accessibilityNeeds: true,
  unitName: true,
  unitBranch: true,
  emailStatus: true,
  onboardedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect

export type SessionUser = Prisma.UserGetPayload<{ select: typeof USER_DTO_SELECT }>

// ---------------------------------------------------------------------------
// Tokens — 32 octets aléatoires, SHA-256 stocké en base, jamais le brut (§9)
// ---------------------------------------------------------------------------

export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

// ---------------------------------------------------------------------------
// Magic link — « le lien crée ton compte, tout simplement » (maquette)
// ---------------------------------------------------------------------------

export interface MagicLinkIssued {
  token: string
  user: { id: string; firstName: string | null; email: string }
}

/**
 * Demande de lien. Si l'email est inconnu, crée un compte « coquille »
 * (accountType null — le type est choisi à la première connexion). Retourne null
 * si l'envoi doit être SAUTÉ (adresse en bounce/plainte, ou throttle d'émission) —
 * l'appelant NE DOIT PAS faire varier sa réponse HTTP pour autant (anti-énumération §9).
 *
 * Création de coquille sans upsert (interaction incertaine de l'upsert avec
 * l'extension de chiffrement qui remplit emailHash) : findFirst → create →
 * en cas de course P2002 sur emailHash, re-findFirst.
 */
export async function requestMagicLink(
  db: Db,
  emailInput: string,
  now = new Date(),
): Promise<MagicLinkIssued | null> {
  const email = normalizeEmail(emailInput)
  const select = { id: true, firstName: true, email: true, emailStatus: true } as const

  let user = await db.user.findFirst({ where: { email }, select })
  if (!user) {
    try {
      user = await db.user.create({ data: { email }, select })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        user = await db.user.findFirst({ where: { email }, select })
      } else {
        throw error
      }
    }
  }
  if (!user) return null

  // Adresse qui bounce ou s'est plainte : plus JAMAIS d'envoi (réputation, §8).
  if (user.emailStatus !== 'OK') {
    logger.info({ userId: user.id }, 'magic link non envoyé : adresse en bounce/plainte')
    return null
  }

  // Throttle d'émission par email, en base (le limiteur mémoire est par instance).
  const recentTokens = await db.magicLinkToken.count({
    where: {
      userId: user.id,
      createdAt: { gt: new Date(now.getTime() - MAGIC_LINK_EMAIL_WINDOW_MS) },
    },
  })
  if (recentTokens >= MAGIC_LINK_EMAIL_MAX_PER_WINDOW) {
    logger.info({ userId: user.id }, 'magic link non envoyé : throttle émission')
    return null
  }

  const token = generateToken()
  await db.$transaction([
    // Invalidation de tous les tokens précédents du même utilisateur (§9)
    db.magicLinkToken.updateMany({
      where: { userId: user.id, invalidatedAt: null },
      data: { invalidatedAt: now },
    }),
    db.magicLinkToken.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MS),
        maxUses: MAGIC_LINK_MAX_USES,
      },
    }),
  ])
  return { token, user: { id: user.id, firstName: user.firstName, email: user.email } }
}

export interface ConsumeContext {
  ip: string
  userAgent: string
  now?: Date
}

/**
 * Consommation d'un lien. Incrément atomique du compteur pour éviter les courses
 * (le plafond effectif est MAGIC_LINK_MAX_USES, constant à l'émission).
 * Chaque utilisation est journalisée avec IP + user-agent — JAMAIS le token (§9).
 */
export async function consumeMagicLink(
  db: Db,
  rawToken: string,
  ctx: ConsumeContext,
): Promise<{ userId: string } | null> {
  const now = ctx.now ?? new Date()
  const tokenHash = hashToken(rawToken)

  const updated = await db.magicLinkToken.updateMany({
    where: {
      tokenHash,
      invalidatedAt: null,
      expiresAt: { gt: now },
      usedCount: { lt: MAGIC_LINK_MAX_USES },
    },
    data: { usedCount: { increment: 1 } },
  })
  if (updated.count === 0) return null

  const token = await db.magicLinkToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, usedCount: true },
  })
  if (!token) return null

  await db.magicLinkUsage.create({
    data: { tokenId: token.id, ip: ctx.ip, userAgent: ctx.userAgent },
  })
  // Signal de surveillance : deux IP distinctes sur un même token est anormal (§9).
  logger.info(
    { tokenId: token.id, userId: token.userId, useCount: token.usedCount },
    'magic link utilisé',
  )
  return { userId: token.userId }
}

// ---------------------------------------------------------------------------
// Sessions — en base, révocables (art. 17), jamais de JWT stateless (§9)
// ---------------------------------------------------------------------------

export async function createSession(db: Db, userId: string, now = new Date()): Promise<string> {
  const raw = generateToken()
  const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS)
  await db.session.create({
    data: {
      tokenHash: hashToken(raw),
      userId,
      expiresAt: new Date(
        Math.min(now.getTime() + SESSION_SLIDING_MS, absoluteExpiresAt.getTime()),
      ),
      absoluteExpiresAt,
      lastRefreshedAt: now,
    },
  })
  return raw
}

export interface ValidatedSession {
  sessionId: string
  user: SessionUser
}

export async function validateSession(
  db: Db,
  rawToken: string,
  now = new Date(),
): Promise<ValidatedSession | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: {
      id: true,
      expiresAt: true,
      absoluteExpiresAt: true,
      lastRefreshedAt: true,
      user: { select: USER_DTO_SELECT },
    },
  })
  if (!session) return null

  if (session.expiresAt <= now || session.absoluteExpiresAt <= now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  // Expiration glissante, rafraîchie au plus une fois par 24 h, plafonnée à 6 mois (§9).
  if (now.getTime() - session.lastRefreshedAt.getTime() >= SESSION_REFRESH_INTERVAL_MS) {
    const newExpiry = new Date(
      Math.min(now.getTime() + SESSION_SLIDING_MS, session.absoluteExpiresAt.getTime()),
    )
    await db.session.update({
      where: { id: session.id },
      data: { expiresAt: newExpiry, lastRefreshedAt: now },
    })
  }

  return { sessionId: session.id, user: session.user }
}

export async function revokeSession(db: Db, rawToken: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } })
}

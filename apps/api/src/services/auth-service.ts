import { createHash, randomBytes } from 'node:crypto'
import { type Db, normalizeEmail } from '@repo/db'
import { logger } from '../lib/logger'

// ---------------------------------------------------------------------------
// Constantes (§9) — modifiables uniquement après discussion explicite
// ---------------------------------------------------------------------------

/** TTL 10 min : absorbe la latence de délivrance, limite la fenêtre de rejeu. Pas 5 min. */
export const MAGIC_LINK_TTL_MS = 10 * 60 * 1000
/** Multi-usage plafonné (décision assumée §9) : absorbe scanners d'email et doubles-clics. */
export const MAGIC_LINK_MAX_USES = 5
/** Session glissante : 90 jours d'inactivité. */
export const SESSION_SLIDING_MS = 90 * 24 * 60 * 60 * 1000
/** Plafond absolu : 6 mois après création, jamais repoussé. */
export const SESSION_ABSOLUTE_MS = 180 * 24 * 60 * 60 * 1000
/** Rafraîchir l'expiration au plus une fois par 24 h (sinon une écriture par requête). */
export const SESSION_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

/** Select explicite du DTO adhérent (§5) — jamais de findMany nu sur une table à PII. */
export const MEMBER_DTO_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  address: true,
  birthDate: true,
  emailStatus: true,
  createdAt: true,
  updatedAt: true,
} as const

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
// Magic link
// ---------------------------------------------------------------------------

export interface MagicLinkIssued {
  token: string
  member: { id: string; firstName: string; email: string }
}

/**
 * Demande de lien. Retourne null si l'email est inconnu — l'appelant NE DOIT PAS
 * faire varier sa réponse HTTP pour autant (anti-énumération §9).
 * Le lookup passe par le blind index : l'extension réécrit `where { email }` en
 * recherche sur `emailHash`.
 */
export async function requestMagicLink(
  db: Db,
  emailInput: string,
  now = new Date(),
): Promise<MagicLinkIssued | null> {
  const email = normalizeEmail(emailInput)
  const member = await db.member.findFirst({
    where: { email },
    select: { id: true, firstName: true, email: true },
  })
  if (!member) return null

  const token = generateToken()
  await db.$transaction([
    // Invalidation de tous les tokens précédents du même adhérent (§9)
    db.magicLinkToken.updateMany({
      where: { memberId: member.id, invalidatedAt: null },
      data: { invalidatedAt: now },
    }),
    db.magicLinkToken.create({
      data: {
        tokenHash: hashToken(token),
        memberId: member.id,
        expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MS),
        maxUses: MAGIC_LINK_MAX_USES,
      },
    }),
  ])
  return { token, member }
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
): Promise<{ memberId: string } | null> {
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
    select: { id: true, memberId: true, usedCount: true },
  })
  if (!token) return null

  await db.magicLinkUsage.create({
    data: { tokenId: token.id, ip: ctx.ip, userAgent: ctx.userAgent },
  })
  // Signal de surveillance : deux IP distinctes sur un même token est anormal (§9).
  logger.info(
    { tokenId: token.id, memberId: token.memberId, useCount: token.usedCount },
    'magic link utilisé',
  )
  return { memberId: token.memberId }
}

// ---------------------------------------------------------------------------
// Sessions — en base, révocables (art. 17), jamais de JWT stateless (§9)
// ---------------------------------------------------------------------------

export async function createSession(db: Db, memberId: string, now = new Date()): Promise<string> {
  const raw = generateToken()
  const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS)
  await db.session.create({
    data: {
      tokenHash: hashToken(raw),
      memberId,
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
  member: {
    id: string
    firstName: string
    lastName: string
    email: string
    phone: string | null
    address: string | null
    birthDate: string | null
    emailStatus: 'OK' | 'BOUNCED' | 'COMPLAINED'
    createdAt: Date
    updatedAt: Date
  }
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
      member: { select: MEMBER_DTO_SELECT },
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

  return { sessionId: session.id, member: session.member }
}

export async function revokeSession(db: Db, rawToken: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } })
}

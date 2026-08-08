/**
 * Sessions (§9, §10) : expiration glissante, plafond absolu, refresh ≤ 1/24 h,
 * révocation effective à la suppression du compte (DELETE /me).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_ABSOLUTE_MS, SESSION_SLIDING_MS } from '../../src/services/auth-service'
import {
  extractToken,
  resetRateLimiters,
  sessionCookieOf,
  startTestEnv,
  type TestEnv,
} from '../helpers/testenv'

let t: TestEnv
const HOUR_MS = 3600 * 1000
const DAY_MS = 24 * HOUR_MS

beforeAll(async () => {
  t = await startTestEnv()
})

beforeEach(async () => {
  await resetRateLimiters()
  t.outbox.length = 0
})

afterAll(async () => {
  await t.stop()
})

let counter = 0
async function login(): Promise<{ cookie: string; userId: string; sessionId: string }> {
  counter += 1
  const user = await t.db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: `Membre${counter}`,
      lastName: `Test${counter}`,
      email: `membre${counter}@example.org`,
      phone: '+33600000000',
      onboardedAt: new Date(),
    },
  })
  const outboxBefore = t.outbox.length
  await t.app.request('/api/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `membre${counter}@example.org` }),
  })
  await vi.waitFor(() => expect(t.outbox.length).toBeGreaterThan(outboxBefore))
  const email = t.outbox.at(-1)
  if (!email) throw new Error('outbox vide')
  const cb = await t.app.request(`/api/auth/callback?token=${extractToken(email)}`)
  const session = await t.db.session.findFirstOrThrow({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  return { cookie: sessionCookieOf(cb), userId: user.id, sessionId: session.id }
}

describe('cycle de vie de la session', () => {
  it('crée une session à 90 jours avec plafond absolu à 6 mois', async () => {
    const { sessionId } = await login()
    const session = await t.db.session.findUniqueOrThrow({ where: { id: sessionId } })
    const now = Date.now()
    expect(session.expiresAt.getTime()).toBeGreaterThan(now + SESSION_SLIDING_MS - 60_000)
    expect(session.expiresAt.getTime()).toBeLessThan(now + SESSION_SLIDING_MS + 60_000)
    expect(session.absoluteExpiresAt.getTime()).toBeGreaterThan(now + SESSION_ABSOLUTE_MS - 60_000)
  })

  it('ne rafraîchit PAS l’expiration si le dernier refresh date de moins de 24 h', async () => {
    const { cookie, sessionId } = await login()
    const before = await t.db.session.findUniqueOrThrow({ where: { id: sessionId } })
    await t.app.request('/api/me', { headers: { cookie } })
    const after = await t.db.session.findUniqueOrThrow({ where: { id: sessionId } })
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime())
    expect(after.lastRefreshedAt.getTime()).toBe(before.lastRefreshedAt.getTime())
  })

  it('rafraîchit l’expiration glissante après 24 h d’écart (une écriture max/24 h)', async () => {
    const { cookie, sessionId } = await login()
    const staleRefresh = new Date(Date.now() - 25 * HOUR_MS)
    const oldExpiry = new Date(Date.now() + 10 * DAY_MS)
    await t.db.session.update({
      where: { id: sessionId },
      data: { lastRefreshedAt: staleRefresh, expiresAt: oldExpiry },
    })

    const res = await t.app.request('/api/me', { headers: { cookie } })
    expect(res.status).toBe(200)

    const after = await t.db.session.findUniqueOrThrow({ where: { id: sessionId } })
    expect(after.expiresAt.getTime()).toBeGreaterThan(oldExpiry.getTime())
    expect(after.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_SLIDING_MS - 60_000)
    expect(after.lastRefreshedAt.getTime()).toBeGreaterThan(staleRefresh.getTime())
  })

  it('le refresh glissant ne dépasse JAMAIS le plafond absolu (§9)', async () => {
    const { cookie, sessionId } = await login()
    const absolute = new Date(Date.now() + 5 * DAY_MS) // plafond dans 5 jours < 90 jours
    await t.db.session.update({
      where: { id: sessionId },
      data: {
        lastRefreshedAt: new Date(Date.now() - 25 * HOUR_MS),
        absoluteExpiresAt: absolute,
      },
    })

    await t.app.request('/api/me', { headers: { cookie } })

    const after = await t.db.session.findUniqueOrThrow({ where: { id: sessionId } })
    expect(after.expiresAt.getTime()).toBe(absolute.getTime())
  })

  it('rejette une session expirée (glissante) et la supprime', async () => {
    const { cookie, sessionId } = await login()
    await t.db.session.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const res = await t.app.request('/api/me', { headers: { cookie } })
    expect(res.status).toBe(401)
    expect(await t.db.session.count({ where: { id: sessionId } })).toBe(0)
  })

  it('rejette une session au-delà du plafond absolu même si la glissante est valide', async () => {
    const { cookie, sessionId } = await login()
    await t.db.session.update({
      where: { id: sessionId },
      data: { absoluteExpiresAt: new Date(Date.now() - 1000) },
    })

    const res = await t.app.request('/api/me', { headers: { cookie } })
    expect(res.status).toBe(401)
  })

  it('la suppression du compte (DELETE /me, art. 17) révoque immédiatement la session', async () => {
    const { cookie, userId } = await login()

    const del = await t.app.request('/api/me', { method: 'DELETE', headers: { cookie } })
    expect(del.status).toBe(200)

    const res = await t.app.request('/api/me', { headers: { cookie } })
    expect(res.status).toBe(401)
    expect(await t.db.session.count({ where: { userId } })).toBe(0)
    expect(await t.db.user.count({ where: { id: userId } })).toBe(0)
  })
})

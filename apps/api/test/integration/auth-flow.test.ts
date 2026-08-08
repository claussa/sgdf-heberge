/**
 * Tests critiques du magic link (§10) :
 * expiration 10 min, plafond d'utilisations, invalidation des tokens précédents,
 * 302 vers une URL sans token, réponse identique pour un email inexistant,
 * rate limiting par email.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAGIC_LINK_MAX_USES } from '../../src/services/auth-service'
import {
  extractToken,
  resetRateLimiters,
  sessionCookieOf,
  startTestEnv,
  type TestEnv,
} from '../helpers/testenv'

let t: TestEnv

beforeAll(async () => {
  t = await startTestEnv()
  await t.db.member.create({
    data: {
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alice@example.org',
      phone: '+33600000001',
    },
  })
})

beforeEach(async () => {
  await resetRateLimiters()
  t.outbox.length = 0
})

afterAll(async () => {
  await t.stop()
})

async function requestLink(email: string): Promise<Response> {
  return t.app.request('/api/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

async function lastEmailToken(): Promise<string> {
  await vi.waitFor(() => {
    expect(t.outbox.length).toBeGreaterThan(0)
  })
  const email = t.outbox.at(-1)
  if (!email) throw new Error('outbox vide')
  return extractToken(email)
}

describe('demande de lien', () => {
  it('répond 202 et envoie un email quand le compte existe', async () => {
    const res = await requestLink('alice@example.org')
    expect(res.status).toBe(202)
    const token = await lastEmailToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // le mail avertit de ne pas transférer (§9)
    expect(t.outbox.at(-1)?.text).toContain('Ne transférez pas ce message')
  })

  it('anti-énumération : réponse STRICTEMENT identique pour un email inconnu (§9)', async () => {
    const known = await requestLink('alice@example.org')
    const unknown = await requestLink('inconnu@example.org')
    expect(unknown.status).toBe(known.status)
    expect(await unknown.text()).toBe(await known.text())
    // …et aucun email n'est parti pour l'inconnu
    await vi.waitFor(() => expect(t.outbox.length).toBe(1))
  })

  it('rate limiting par email : 4e demande refusée (§9)', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await requestLink('alice@example.org')).status).toBe(202)
    }
    const res = await requestLink('alice@example.org')
    expect(res.status).toBe(429)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('RATE_LIMITED')
  })

  it('le token n’apparaît jamais en clair en base (SHA-256 stocké, §9)', async () => {
    await requestLink('alice@example.org')
    const token = await lastEmailToken()
    const rows = await t.db.magicLinkToken.findMany({ select: { tokenHash: true } })
    for (const row of rows) {
      expect(row.tokenHash).not.toBe(token)
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    }
  })
})

describe('callback', () => {
  it('pose un cookie httpOnly/SameSite=Lax et redirige en 302 vers une URL SANS token (§9)', async () => {
    await requestLink('alice@example.org')
    const token = await lastEmailToken()

    const res = await t.app.request(`/api/auth/callback?token=${token}`)
    expect(res.status).toBe(302)

    const location = res.headers.get('location')
    expect(location).toBe('http://localhost:5173/')
    expect(location).not.toContain(token)

    expect(res.headers.get('referrer-policy')).toBe('no-referrer')

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toMatch(/Max-Age=\d+/)
    expect(setCookie).not.toContain(token)
  })

  it('accepte les rejeux jusqu’au plafond puis refuse (scanners d’email, §9)', async () => {
    await requestLink('alice@example.org')
    const token = await lastEmailToken()

    for (let use = 1; use <= MAGIC_LINK_MAX_USES; use++) {
      const res = await t.app.request(`/api/auth/callback?token=${token}`)
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('http://localhost:5173/')
    }
    const over = await t.app.request(`/api/auth/callback?token=${token}`)
    expect(over.headers.get('location')).toContain('error=lien-invalide')
  })

  it('journalise chaque utilisation avec IP et user-agent, sans le token (§9)', async () => {
    await requestLink('alice@example.org')
    const token = await lastEmailToken()
    await t.app.request(`/api/auth/callback?token=${token}`, {
      headers: { 'x-forwarded-for': '203.0.113.9', 'user-agent': 'TestBrowser/1.0' },
    })
    const usages = await t.db.magicLinkUsage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 1,
    })
    expect(usages[0]).toMatchObject({ ip: '203.0.113.9', userAgent: 'TestBrowser/1.0' })
    expect(JSON.stringify(usages)).not.toContain(token)
  })

  it('refuse un token expiré (TTL 10 min, §9)', async () => {
    await requestLink('alice@example.org')
    const token = await lastEmailToken()
    await t.db.magicLinkToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })

    const res = await t.app.request(`/api/auth/callback?token=${token}`)
    expect(res.headers.get('location')).toContain('error=lien-invalide')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('invalide les tokens précédents à chaque nouvelle demande (§9)', async () => {
    await requestLink('alice@example.org')
    const first = await lastEmailToken()
    await requestLink('alice@example.org')
    await vi.waitFor(() => expect(t.outbox.length).toBe(2))
    const second = await lastEmailToken()

    const oldRes = await t.app.request(`/api/auth/callback?token=${first}`)
    expect(oldRes.headers.get('location')).toContain('error=lien-invalide')

    const newRes = await t.app.request(`/api/auth/callback?token=${second}`)
    expect(newRes.headers.get('location')).toBe('http://localhost:5173/')
  })

  it('refuse un token inconnu', async () => {
    const res = await t.app.request('/api/auth/callback?token=nimportequoi')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=lien-invalide')
  })
})

describe('session issue du callback', () => {
  it('donne accès à /me puis la déconnexion révoque la session en base', async () => {
    await requestLink('alice@example.org')
    const token = await lastEmailToken()
    const cb = await t.app.request(`/api/auth/callback?token=${token}`)
    const cookie = sessionCookieOf(cb)

    const me = await t.app.request('/api/me', { headers: { cookie } })
    expect(me.status).toBe(200)
    const body = (await me.json()) as { email: string }
    expect(body.email).toBe('alice@example.org')

    const logout = await t.app.request('/api/auth/logout', {
      method: 'POST',
      headers: { cookie },
    })
    expect(logout.status).toBe(200)

    // Révocation effective : le cookie ne vaut plus rien (session supprimée en base)
    const after = await t.app.request('/api/me', { headers: { cookie } })
    expect(after.status).toBe(401)
  })
})

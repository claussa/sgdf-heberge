/**
 * Tests critiques du magic link (§10) :
 * expiration 10 min, plafond d'utilisations, invalidation des tokens précédents,
 * 302 vers une URL sans token, réponse identique pour un email inexistant,
 * rate limiting par email, comptes coquilles (« le lien crée ton compte »),
 * garde bounce et throttle d'émission en base, onboarding.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAGIC_LINK_EMAIL_MAX_PER_WINDOW,
  MAGIC_LINK_MAX_USES,
  requestMagicLink,
} from '../../src/services/auth-service'
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
  await t.db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alice@example.org',
      phone: '+33600000001',
      onboardedAt: new Date(),
    },
  })
})

beforeEach(async () => {
  await resetRateLimiters()
  // Le throttle d'émission par email est ADOSSÉ À LA BASE (voulu, cross-instance) :
  // on repart d'une table de tokens vide pour isoler chaque cas de test.
  await t.db.magicLinkToken.deleteMany({})
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

  it('« le lien crée ton compte » : email inconnu → coquille (accountType null) + envoi', async () => {
    const res = await requestLink('nouvelle@example.org')
    expect(res.status).toBe(202)
    await vi.waitFor(() => expect(t.outbox.length).toBe(1))

    const shell = await t.db.user.findFirst({
      where: { email: 'nouvelle@example.org' },
      select: { accountType: true, onboardedAt: true },
    })
    expect(shell).toMatchObject({ accountType: null, onboardedAt: null })
  })

  it('anti-énumération : réponse STRICTEMENT identique connu/inconnu (§9)', async () => {
    const known = await requestLink('alice@example.org')
    const unknown = await requestLink('inconnue2@example.org')
    expect(unknown.status).toBe(known.status)
    expect(await unknown.text()).toBe(await known.text())
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

  it("throttle d'émission en base : ≥ 3 tokens en 15 min → émission sautée (§8)", async () => {
    // Appel direct du service : le limiteur HTTP mémoire est par instance,
    // ce throttle-ci est le plafond PARTAGÉ entre instances.
    for (let i = 0; i < MAGIC_LINK_EMAIL_MAX_PER_WINDOW; i++) {
      expect(await requestMagicLink(t.db, 'throttle@example.org')).not.toBeNull()
    }
    expect(await requestMagicLink(t.db, 'throttle@example.org')).toBeNull()
  })

  it('adresse en bounce : plus AUCUN envoi (réputation, §8)', async () => {
    await t.db.user.create({
      data: { email: 'bounce@example.org', emailStatus: 'BOUNCED' },
    })
    const res = await requestLink('bounce@example.org')
    expect(res.status).toBe(202) // réponse toujours identique…
    await new Promise((r) => setTimeout(r, 150))
    expect(t.outbox.length).toBe(0) // …mais rien ne part
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
    expect(setCookie).toContain('heberge_session=')
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

describe('session, /me et onboarding', () => {
  async function loginAs(email: string): Promise<string> {
    t.outbox.length = 0
    await resetRateLimiters()
    await requestLink(email)
    const token = await lastEmailToken()
    const cb = await t.app.request(`/api/auth/callback?token=${token}`)
    return sessionCookieOf(cb)
  }

  it('donne accès à /me puis la déconnexion révoque la session en base', async () => {
    const cookie = await loginAs('alice@example.org')

    const me = await t.app.request('/api/me', { headers: { cookie } })
    expect(me.status).toBe(200)
    const body = (await me.json()) as { email: string; accountType: string }
    expect(body.email).toBe('alice@example.org')
    expect(body.accountType).toBe('INDIVIDUAL')

    const logout = await t.app.request('/api/auth/logout', {
      method: 'POST',
      headers: { cookie },
    })
    expect(logout.status).toBe(200)

    // Révocation effective : le cookie ne vaut plus rien (session supprimée en base)
    const after = await t.app.request('/api/me', { headers: { cookie } })
    expect(after.status).toBe(401)
  })

  it('coquille → onboarding INDIVIDUAL → type définitif (SCOUT_UNIT refusé ensuite)', async () => {
    const cookie = await loginAs('onboard@example.org')

    const before = await t.app.request('/api/me', { headers: { cookie } })
    expect(((await before.json()) as { accountType: null }).accountType).toBeNull()

    const onboard = await t.app.request('/api/me/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        accountType: 'INDIVIDUAL',
        firstName: 'Nadia',
        lastName: 'Test',
        phone: '06 00 11 22 33',
        groupSize: 2,
        accessibilityNeeds: ['pmr', 'quiet'],
      }),
    })
    expect(onboard.status).toBe(200)
    const me = (await onboard.json()) as {
      accountType: string
      accessibilityNeeds: string[]
      onboardedAt: string | null
    }
    expect(me.accountType).toBe('INDIVIDUAL')
    expect(me.accessibilityNeeds).toEqual(['pmr', 'quiet'])
    expect(me.onboardedAt).not.toBeNull()

    const switchType = await t.app.request('/api/me/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        accountType: 'SCOUT_UNIT',
        unitName: '1re Test',
        unitBranch: 'Scouts-Guides',
        firstName: 'Nadia',
        lastName: 'Test',
        phone: '06 00 11 22 33',
      }),
    })
    expect(switchType.status).toBe(409)
  })

  it("espaces opt-in : l'onboarding hébergeur n'active pas la recherche, le profil volontaire oui", async () => {
    const cookie = await loginAs('hote@example.org')

    // Parcours « Je propose un logement » : pas de seeksAccommodation dans le payload
    const onboard = await t.app.request('/api/me/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        accountType: 'INDIVIDUAL',
        firstName: 'Paul',
        lastName: 'Hôte',
        phone: '06 00 44 55 66',
      }),
    })
    expect(onboard.status).toBe(200)
    const afterOnboard = (await onboard.json()) as { seeksAccommodation: boolean }
    expect(afterOnboard.seeksAccommodation).toBe(false)

    // « Chercher aussi un logement, ailleurs » : le profil volontaire active l'espace
    const patch = await t.app.request('/api/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ seeksAccommodation: true }),
    })
    expect(patch.status).toBe(200)
    expect(((await patch.json()) as { seeksAccommodation: boolean }).seeksAccommodation).toBe(true)
  })

  it("parcours « Je cherche un logement » : la recherche est active dès l'onboarding", async () => {
    const cookie = await loginAs('cherche@example.org')
    const onboard = await t.app.request('/api/me/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        accountType: 'INDIVIDUAL',
        firstName: 'Sam',
        lastName: 'Cherche',
        phone: '06 00 77 88 99',
        seeksAccommodation: true,
      }),
    })
    expect(onboard.status).toBe(200)
    expect(((await onboard.json()) as { seeksAccommodation: boolean }).seeksAccommodation).toBe(
      true,
    )
  })

  it("les routes d'un autre type de compte sont interdites (cloisonnement)", async () => {
    const cookie = await loginAs('unite@example.org')
    await t.app.request('/api/me/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        accountType: 'SCOUT_UNIT',
        unitName: '1re Nancy',
        unitBranch: 'Pionniers-Caravelles',
        firstName: 'Nina',
        lastName: 'Colin',
        phone: '06 77 88 99 00',
      }),
    })
    const me = await t.app.request('/api/me', { headers: { cookie } })
    expect(((await me.json()) as { accountType: string }).accountType).toBe('SCOUT_UNIT')
  })
})

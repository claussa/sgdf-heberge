/**
 * §10 — filet de sécurité sur la minimisation : aucune réponse d'API ne contient
 * de champ PII/technique non déclaré dans son schéma de réponse.
 */

import { MeSchema, UserExportSchema } from '@repo/contracts'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  extractToken,
  resetRateLimiters,
  sessionCookieOf,
  startTestEnv,
  type TestEnv,
} from '../helpers/testenv'

let t: TestEnv
let cookie: string

/** Les champs qui ne doivent JAMAIS sortir, où que ce soit dans une réponse. */
const FORBIDDEN_KEYS = ['emailHash', 'tokenHash', 'passwordHash', 'invalidatedAt', 'usedCount']

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys)
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k)
      collectKeys(v, keys)
    }
  }
  return keys
}

beforeAll(async () => {
  t = await startTestEnv()
  await t.db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alice@example.org',
      phone: '+33600000001',
      accessibilityNeeds: JSON.stringify(['pmr']),
      onboardedAt: new Date(),
    },
  })
  await t.app.request('/api/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'alice@example.org' }),
  })
  await vi.waitFor(() => expect(t.outbox.length).toBe(1))
  const email = t.outbox[0]
  if (!email) throw new Error('outbox vide')
  const cb = await t.app.request(`/api/auth/callback?token=${extractToken(email)}`)
  cookie = sessionCookieOf(cb)
})

beforeEach(async () => {
  await resetRateLimiters()
})

afterAll(async () => {
  await t.stop()
})

describe('minimisation en sortie (§5)', () => {
  it('GET /me : uniquement les clés déclarées dans MeSchema, aucune clé interdite', async () => {
    const res = await t.app.request('/api/me', { headers: { cookie } })
    const body = (await res.json()) as Record<string, unknown>
    const allowed = new Set(Object.keys(MeSchema.shape))
    for (const key of Object.keys(body)) {
      expect(allowed, `clé inattendue: ${key}`).toContain(key)
    }
    const keys = collectKeys(body)
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys, `champ non déclaré exposé: ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('GET /me/export : conforme au schéma d’export, sans champs techniques', async () => {
    const res = await t.app.request('/api/me/export', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(() => UserExportSchema.parse(body)).not.toThrow()
    const keys = collectKeys(body)
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('un conflit applicatif renvoie le format unique, sans structure Prisma (§5)', async () => {
    // Changer de type de compte après onboarding → 409 CONFLICT applicatif
    const res = await t.app.request('/api/me/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        accountType: 'SCOUT_UNIT',
        unitName: '1re Test',
        unitBranch: 'Scouts-Guides',
        firstName: 'Alice',
        lastName: 'Martin',
        phone: '+33600000001',
      }),
    })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toEqual({
      error: { code: 'CONFLICT', message: expect.any(String) },
    })
    const text = JSON.stringify(body).toLowerCase()
    for (const leak of ['prisma', 'emailhash', 'unique constraint', 'user.']) {
      expect(text).not.toContain(leak)
    }
  })

  it('une erreur de validation renvoie le format unique déclaré (§5)', async () => {
    const res = await t.app.request('/api/auth/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'pas-un-email' }),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: expect.any(String) },
    })
  })
})

describe('spec OpenAPI (§5)', () => {
  it('/openapi.json expose un spec 3.1 avec les routes principales', async () => {
    const res = await t.app.request('/api/openapi.json')
    expect(res.status).toBe(200)
    const spec = (await res.json()) as { openapi: string; paths: Record<string, unknown> }
    expect(spec.openapi).toBe('3.1.0')
    for (const path of [
      '/auth/magic-link',
      '/auth/callback',
      '/me',
      '/me/onboarding',
      '/me/export',
      '/health',
      '/webhooks/resend',
    ]) {
      expect(Object.keys(spec.paths), `chemin manquant: ${path}`).toContain(path)
    }
  })
})

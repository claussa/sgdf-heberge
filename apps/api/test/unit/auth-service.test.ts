import { MAGIC_LINK_RESEND_COOLDOWN_SECONDS } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
import {
  generateToken,
  hashToken,
  MAGIC_LINK_MAX_USES,
  MAGIC_LINK_RESEND_COOLDOWN_MS,
  MAGIC_LINK_TTL_MS,
  SESSION_ABSOLUTE_MS,
  SESSION_REFRESH_INTERVAL_MS,
  SESSION_SLIDING_MS,
} from '../../src/services/auth-service'

describe('tokens (§9)', () => {
  it('génère 32 octets aléatoires en base64url', () => {
    const token = generateToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
  })

  it('deux tokens successifs sont distincts', () => {
    expect(generateToken()).not.toBe(generateToken())
  })

  it('hashToken est un SHA-256 hex déterministe, distinct du token brut', () => {
    const token = generateToken()
    const hash = hashToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(hashToken(token))
    expect(hash).not.toContain(token)
  })
})

describe('constantes décidées (§9) — ne pas modifier sans discussion', () => {
  it('TTL du magic link : 10 minutes (pas 5)', () => {
    expect(MAGIC_LINK_TTL_MS).toBe(10 * 60 * 1000)
  })

  it('plafond de 3 à 5 utilisations', () => {
    expect(MAGIC_LINK_MAX_USES).toBeGreaterThanOrEqual(3)
    expect(MAGIC_LINK_MAX_USES).toBeLessThanOrEqual(5)
  })

  it('cooldown de renvoi : 5 minutes, même constante que le timer front (@repo/contracts)', () => {
    expect(MAGIC_LINK_RESEND_COOLDOWN_MS).toBe(5 * 60 * 1000)
    expect(MAGIC_LINK_RESEND_COOLDOWN_MS).toBe(MAGIC_LINK_RESEND_COOLDOWN_SECONDS * 1000)
  })

  it('session glissante 90 jours, plafond absolu 6 mois, refresh 24 h max', () => {
    expect(SESSION_SLIDING_MS).toBe(90 * 24 * 3600 * 1000)
    expect(SESSION_ABSOLUTE_MS).toBe(180 * 24 * 3600 * 1000)
    expect(SESSION_REFRESH_INTERVAL_MS).toBe(24 * 3600 * 1000)
  })
})

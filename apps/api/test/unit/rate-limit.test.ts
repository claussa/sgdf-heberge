import { describe, expect, it } from 'vitest'
import { RateLimiter } from '../../src/middleware/rate-limit'

describe('RateLimiter (§9)', () => {
  it('autorise max requêtes puis bloque dans la fenêtre', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 3 })
    const now = 1_000_000
    expect(limiter.consume('k', now)).toBe(true)
    expect(limiter.consume('k', now + 1)).toBe(true)
    expect(limiter.consume('k', now + 2)).toBe(true)
    expect(limiter.consume('k', now + 3)).toBe(false)
  })

  it('réautorise après expiration de la fenêtre', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 1 })
    const now = 1_000_000
    expect(limiter.consume('k', now)).toBe(true)
    expect(limiter.consume('k', now + 500)).toBe(false)
    expect(limiter.consume('k', now + 1001)).toBe(true)
  })

  it('isole les clés (email vs email, IP vs IP)', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 1 })
    const now = 1_000_000
    expect(limiter.consume('a', now)).toBe(true)
    expect(limiter.consume('b', now)).toBe(true)
    expect(limiter.consume('a', now + 1)).toBe(false)
  })
})

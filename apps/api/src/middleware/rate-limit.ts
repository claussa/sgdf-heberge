import type { Context } from 'hono'
import { AppError } from '../errors'

/**
 * Rate limiting en mémoire, fenêtre fixe (§9).
 * ⚠️ Par instance : sur Serverless Container avec N instances, la limite effective
 * est N × max. Suffisant comme garde-fou anti-abus pour le run ; passer à un store
 * partagé (Redis) si le besoin devient du quota strict.
 */
interface Bucket {
  count: number
  resetAt: number
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>()
  private windowMs: number
  private max: number

  constructor(options: { windowMs: number; max: number }) {
    this.windowMs = options.windowMs
    this.max = options.max
  }

  /** true si l'appel est autorisé, false si la limite est atteinte. */
  consume(key: string, now = Date.now()): boolean {
    this.gc(now)
    const bucket = this.buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs })
      return true
    }
    bucket.count += 1
    return bucket.count <= this.max
  }

  private gc(now: number): void {
    if (this.buckets.size < 10_000) return
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key)
    }
  }

  /** Réservé aux tests. */
  reset(): void {
    this.buckets.clear()
  }
}

/** IP client : première entrée de X-Forwarded-For (posé par Edge Services / LB). */
export function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}

export function assertWithinLimit(limiter: RateLimiter, key: string): void {
  if (!limiter.consume(key)) {
    throw new AppError('RATE_LIMITED', 'Trop de requêtes, réessayez plus tard')
  }
}

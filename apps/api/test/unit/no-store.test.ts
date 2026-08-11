import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { noStore } from '../../src/middleware/no-store'

describe('noStore (§5 — le cache Edge est global, les réponses API portent des PII)', () => {
  it('pose Cache-Control: no-store par défaut', async () => {
    const app = new Hono()
    app.use(noStore)
    app.get('/x', (c) => c.json({ ok: true }))
    const res = await app.request('/x')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('ne remplace pas un Cache-Control posé explicitement par une route', async () => {
    const app = new Hono()
    app.use(noStore)
    app.get('/x', (c) => {
      c.header('Cache-Control', 'public, max-age=60')
      return c.body('ok')
    })
    const res = await app.request('/x')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60')
  })
})

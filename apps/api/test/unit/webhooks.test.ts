import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifySvixSignature } from '../../src/routes/webhooks'

const SECRET_RAW = Buffer.from('super-secret-webhook-key-0123456789')
const SECRET = `whsec_${SECRET_RAW.toString('base64')}`

function sign(id: string, timestamp: string, payload: string): string {
  const sig = createHmac('sha256', SECRET_RAW)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64')
  return `v1,${sig}`
}

describe('vérification de signature svix (webhooks Resend, §8)', () => {
  const payload = JSON.stringify({ type: 'email.bounced', data: { to: ['a@b.fr'] } })
  const nowS = 1_754_600_000

  it('accepte une signature valide', () => {
    const timestamp = String(nowS)
    expect(
      verifySvixSignature({
        secret: SECRET,
        id: 'msg_1',
        timestamp,
        signature: sign('msg_1', timestamp, payload),
        payload,
        nowS,
      }),
    ).toBe(true)
  })

  it('rejette une signature altérée', () => {
    const timestamp = String(nowS)
    expect(
      verifySvixSignature({
        secret: SECRET,
        id: 'msg_1',
        timestamp,
        signature: sign('msg_1', timestamp, `${payload} `),
        payload,
        nowS,
      }),
    ).toBe(false)
  })

  it('rejette un timestamp trop ancien (anti-rejeu)', () => {
    const timestamp = String(nowS - 3600)
    expect(
      verifySvixSignature({
        secret: SECRET,
        id: 'msg_1',
        timestamp,
        signature: sign('msg_1', timestamp, payload),
        payload,
        nowS,
      }),
    ).toBe(false)
  })

  it('accepte un lot de signatures dont une seule est valide', () => {
    const timestamp = String(nowS)
    const good = sign('msg_1', timestamp, payload)
    expect(
      verifySvixSignature({
        secret: SECRET,
        id: 'msg_1',
        timestamp,
        signature: `v1,AAAA ${good}`,
        payload,
        nowS,
      }),
    ).toBe(true)
  })
})

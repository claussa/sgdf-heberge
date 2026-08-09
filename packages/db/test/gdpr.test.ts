/**
 * RGPD (§6, §10) :
 * - deleteUserData : effacement art. 17 en une opération, AUCUNE ligne orpheline
 * - exportUserData : portabilité art. 20, données déchiffrées, sans champs techniques
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteUserData, exportUserData } from '../src/gdpr'
import { startTestDb, type TestDb } from './helpers/testdb'

let t: TestDb

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

let hostId: string
let requesterId: string

async function createGraph() {
  const host = await t.db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: 'Claire',
      lastName: 'Martin',
      email: 'claire@exemple.fr',
      phone: '06 12 34 56 78',
    },
  })
  const requester = await t.db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: 'Marie',
      lastName: 'Lefèvre',
      email: 'marie@exemple.fr',
      phone: '06 98 76 54 32',
      groupSize: 3,
    },
  })
  const listing = await t.db.listing.create({
    data: {
      ownerId: host.id,
      site: 'paris',
      addressFull: '12 rue des Boulets, 75012 Paris',
      displayArea: 'Paris 12e',
      availableFrom: d('2026-09-24'),
      availableTo: d('2026-09-29'),
      capacity: 8,
      beds: { create: [{ type: 'PRIVATE_ROOM', count: 2, capacityEach: 2 }] },
    },
  })
  await t.db.lodgingRequest.create({
    data: {
      listingId: listing.id,
      requesterId: requester.id,
      dateFrom: d('2026-09-25'),
      dateTo: d('2026-09-28'),
      peopleCount: 3,
      messages: {
        create: [
          { senderId: requester.id, body: 'Bonjour, nous sommes trois.' },
          { senderId: host.id, body: 'Vous arrivez avant 20 h ?' },
        ],
      },
    },
  })
  const ad = await t.db.jumelageAd.create({
    data: {
      userId: host.id,
      kind: 'HOSTING',
      site: 'metz',
      dateFrom: d('2026-09-25'),
      dateTo: d('2026-09-28'),
      peopleLabel: '30 personnes',
    },
  })
  await t.db.jumelageContact.create({
    data: { adId: ad.id, requesterId: requester.id, message: 'Nous serons 21.' },
  })
  await t.db.session.create({
    data: {
      tokenHash: 'a'.repeat(64),
      userId: host.id,
      expiresAt: d('2027-01-01'),
      absoluteExpiresAt: d('2027-02-01'),
    },
  })
  const token = await t.db.magicLinkToken.create({
    data: { tokenHash: 'b'.repeat(64), userId: host.id, expiresAt: d('2027-01-01') },
  })
  await t.db.magicLinkUsage.create({
    data: { tokenId: token.id, ip: '203.0.113.1', userAgent: 'test' },
  })
  hostId = host.id
  requesterId = requester.id
}

beforeAll(async () => {
  t = await startTestDb()
  await createGraph()
})

afterAll(async () => {
  await t.stop()
})

describe('exportUserData (art. 20)', () => {
  it("restitue le profil déchiffré, les logements avec l'adresse, les messages écrits", async () => {
    const exportHost = await exportUserData(t.db, hostId)
    expect(exportHost.format).toBe('heberge/user-export')
    expect(exportHost.user.email).toBe('claire@exemple.fr')
    expect(exportHost.user.phone).toBe('06 12 34 56 78')
    expect(exportHost.user.listings[0]?.addressFull).toBe('12 rue des Boulets, 75012 Paris')
    expect(exportHost.user.listings[0]?.beds).toHaveLength(1)
    expect(exportHost.user.requestMessages.map((m) => m.body)).toContain(
      'Vous arrivez avant 20 h ?',
    )
    expect(exportHost.user.jumelageAds).toHaveLength(1)
  })

  it('les demandes reçues sont réduites aux métadonnées (pas de PII des demandeurs)', async () => {
    const exportHost = await exportUserData(t.db, hostId)
    const received = exportHost.user.listings[0]?.requests[0]
    expect(received).toBeDefined()
    expect(Object.keys(received ?? {}).sort()).toEqual(
      ['createdAt', 'dateFrom', 'dateTo', 'id', 'peopleCount', 'status'].sort(),
    )
  })

  it("n'expose aucun champ technique (emailHash, tokenHash)", async () => {
    const exportHost = await exportUserData(t.db, hostId)
    const flat = JSON.stringify(exportHost)
    expect(flat).not.toContain('emailHash')
    expect(flat).not.toContain('tokenHash')
  })
})

describe('deleteUserData (art. 17) — aucune ligne orpheline', () => {
  it("supprime l'hébergeur : logements, couchages, demandes reçues, messages, jumelage, sessions, tokens", async () => {
    await deleteUserData(t.db, hostId)

    expect(await t.rawDb.user.count({ where: { id: hostId } })).toBe(0)
    expect(await t.rawDb.listing.count()).toBe(0)
    expect(await t.rawDb.listingBed.count()).toBe(0)
    // La demande de Marie portait sur le logement supprimé → cascade, plus de messages
    expect(await t.rawDb.lodgingRequest.count()).toBe(0)
    expect(await t.rawDb.requestMessage.count()).toBe(0)
    expect(await t.rawDb.jumelageAd.count()).toBe(0)
    expect(await t.rawDb.jumelageContact.count()).toBe(0)
    expect(await t.rawDb.session.count()).toBe(0)
    expect(await t.rawDb.magicLinkToken.count()).toBe(0)
    expect(await t.rawDb.magicLinkUsage.count()).toBe(0)
  })

  it('laisse intacts les autres comptes, puis les supprime sans reste', async () => {
    expect(await t.rawDb.user.count({ where: { id: requesterId } })).toBe(1)

    await deleteUserData(t.db, requesterId)
    expect(await t.rawDb.user.count()).toBe(0)

    // État final : plus une seule ligne dans aucune table métier
    for (const count of [
      await t.rawDb.listing.count(),
      await t.rawDb.listingBed.count(),
      await t.rawDb.lodgingRequest.count(),
      await t.rawDb.requestMessage.count(),
      await t.rawDb.jumelageAd.count(),
      await t.rawDb.jumelageContact.count(),
      await t.rawDb.session.count(),
      await t.rawDb.magicLinkToken.count(),
      await t.rawDb.magicLinkUsage.count(),
    ]) {
      expect(count).toBe(0)
    }
  })
})

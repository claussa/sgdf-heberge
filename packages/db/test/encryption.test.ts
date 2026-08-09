/**
 * Tests critiques du premier jour (§10) :
 * - email/phone/accessibilityNeeds (User), addressFull (Listing), body (RequestMessage)
 *   et message (JumelageContact) stockés CHIFFRÉS ; firstName/lastName/unitName/displayArea
 *   EN CLAIR (vérifié en SQL brut, hors extension Prisma)
 * - le lookup par email passe par le blind index (emailHash), pas par le ciphertext
 * - le sel du blind index est bien un secret DISTINCT de la clé de chiffrement
 */
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { normalizeEmail } from '../src/normalize'
import { startTestDb, type TestDb } from './helpers/testdb'

let t: TestDb

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

beforeAll(async () => {
  t = await startTestDb()
  const marie = await t.db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: 'Marie',
      lastName: 'Lefèvre',
      email: 'marie.lefevre@exemple.fr',
      phone: '06 98 76 54 32',
      accessibilityNeeds: JSON.stringify(['pmr']),
      unitName: null,
    },
  })
  const claire = await t.db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName: 'Claire',
      lastName: 'Martin',
      email: 'claire@exemple.fr',
      phone: '06 12 34 56 78',
      unitName: '1re Nancy', // en clair (cartes jumelage) — porté ici pour le test
    },
  })
  const listing = await t.db.listing.create({
    data: {
      ownerId: claire.id,
      site: 'paris',
      addressFull: '12 rue des Boulets, 75012 Paris',
      displayArea: 'Paris 12e',
      availableFrom: d('2026-09-24'),
      availableTo: d('2026-09-29'),
      capacity: 2,
    },
  })
  await t.db.lodgingRequest.create({
    data: {
      listingId: listing.id,
      requesterId: marie.id,
      dateFrom: d('2026-09-25'),
      dateTo: d('2026-09-28'),
      peopleCount: 3,
      messages: {
        create: [{ senderId: marie.id, body: 'Bonjour Claire, mon numéro : 06 98 76 54 32' }],
      },
    },
  })
  const ad = await t.db.jumelageAd.create({
    data: {
      userId: claire.id,
      kind: 'HOSTING',
      site: 'metz',
      dateFrom: d('2026-09-25'),
      dateTo: d('2026-09-28'),
      peopleLabel: '30 personnes',
    },
  })
  await t.db.jumelageContact.create({
    data: { adId: ad.id, requesterId: marie.id, message: 'Nous serons 21, contact 06 77 88 99 00' },
  })
})

afterAll(async () => {
  await t.stop()
})

describe('chiffrement au repos (vérifié hors extension)', () => {
  it('stocke email, phone et accessibilityNeeds chiffrés (format cloak v1.aesgcm256)', async () => {
    const rows = await t.rawDb.$queryRawUnsafe<
      Array<{ email: string; phone: string; accessibilityNeeds: string | null }>
    >('SELECT email, phone, "accessibilityNeeds" FROM "User" WHERE "firstName" = \'Marie\'')
    expect(rows).toHaveLength(1)
    const row = rows[0]
    if (!row) throw new Error('ligne manquante')
    for (const value of [row.email, row.phone, row.accessibilityNeeds]) {
      expect(value).toMatch(/^v1\.aesgcm256\./)
      expect(value).not.toContain('marie')
      expect(value).not.toContain('98 76')
      expect(value).not.toContain('pmr')
    }
  })

  it('stocke firstName, lastName et unitName en clair (tri/recherche + cartes publiques, §6)', async () => {
    const rows = await t.rawDb.$queryRawUnsafe<
      Array<{ firstName: string; lastName: string; unitName: string }>
    >('SELECT "firstName", "lastName", "unitName" FROM "User" WHERE "firstName" = \'Claire\'')
    expect(rows[0]).toEqual({ firstName: 'Claire', lastName: 'Martin', unitName: '1re Nancy' })
  })

  it("stocke l'adresse complète chiffrée et la zone d'affichage en clair", async () => {
    const rows = await t.rawDb.$queryRawUnsafe<Array<{ addressFull: string; displayArea: string }>>(
      'SELECT "addressFull", "displayArea" FROM "Listing"',
    )
    const row = rows[0]
    if (!row) throw new Error('ligne manquante')
    expect(row.addressFull).toMatch(/^v1\.aesgcm256\./)
    expect(row.addressFull).not.toContain('Boulets')
    expect(row.displayArea).toBe('Paris 12e')
  })

  it('stocke les messages de demande et de jumelage chiffrés', async () => {
    const msgs = await t.rawDb.$queryRawUnsafe<Array<{ body: string }>>(
      'SELECT body FROM "RequestMessage"',
    )
    expect(msgs[0]?.body).toMatch(/^v1\.aesgcm256\./)
    expect(msgs[0]?.body).not.toContain('06 98')
    const contacts = await t.rawDb.$queryRawUnsafe<Array<{ message: string }>>(
      'SELECT message FROM "JumelageContact"',
    )
    expect(contacts[0]?.message).toMatch(/^v1\.aesgcm256\./)
    expect(contacts[0]?.message).not.toContain('06 77')
  })

  it('déchiffre de façon transparente via le client applicatif', async () => {
    const user = await t.db.user.findFirst({
      where: { firstName: 'Marie' },
      select: { email: true, phone: true, accessibilityNeeds: true },
    })
    expect(user).toEqual({
      email: 'marie.lefevre@exemple.fr',
      phone: '06 98 76 54 32',
      accessibilityNeeds: JSON.stringify(['pmr']),
    })
  })
})

describe('blind index (§6) — point d’intégration le plus fragile de la stack', () => {
  it('remplit emailHash avec sha256(email normalisé + sel)', async () => {
    const rows = await t.rawDb.$queryRawUnsafe<Array<{ emailHash: string }>>(
      'SELECT "emailHash" FROM "User" WHERE "firstName" = \'Marie\'',
    )
    const expected = createHash('sha256')
      .update(normalizeEmail('marie.lefevre@exemple.fr'))
      .update(t.hashSalt)
      .digest('hex')
    expect(rows[0]?.emailHash).toBe(expected)
  })

  it('le lookup where { email } passe par le blind index (ciphertext non déterministe)', async () => {
    // Si la recherche comparait le ciphertext, elle ne matcherait jamais :
    // chaque écriture produit un chiffré différent. Ce test casse si l'extension
    // cesse de réécrire la clause where vers emailHash.
    const found = await t.db.user.findFirst({
      where: { email: 'marie.lefevre@exemple.fr' },
      select: { firstName: true },
    })
    expect(found?.firstName).toBe('Marie')
  })

  it('normalise la casse et les espaces à la recherche', async () => {
    const found = await t.db.user.findFirst({
      where: { email: '  MARIE.LEFEVRE@exemple.fr ' },
      select: { firstName: true },
    })
    expect(found?.firstName).toBe('Marie')
  })

  it('ne matche pas un email inconnu', async () => {
    const found = await t.db.user.findFirst({ where: { email: 'autre@exemple.fr' } })
    expect(found).toBeNull()
  })

  it('le hash dépend du sel : un sel différent produit un hash différent (clés séparées, §6)', async () => {
    const rows = await t.rawDb.$queryRawUnsafe<Array<{ emailHash: string }>>(
      'SELECT "emailHash" FROM "User" WHERE "firstName" = \'Marie\'',
    )
    const withOtherSalt = createHash('sha256')
      .update(normalizeEmail('marie.lefevre@exemple.fr'))
      .update('un-autre-sel')
      .digest('hex')
    expect(rows[0]?.emailHash).not.toBe(withOtherSalt)
    // …et le sel n'est pas la clé de chiffrement elle-même
    expect(t.hashSalt).not.toBe(t.encryptionKey)
  })
})

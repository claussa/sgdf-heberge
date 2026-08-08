/**
 * Tests critiques du premier jour (§10) :
 * - email/phone/birthDate stockés CHIFFRÉS, firstName/lastName EN CLAIR
 *   (vérifié en SQL brut, hors extension Prisma)
 * - le lookup par email passe par le blind index (emailHash), pas par le ciphertext
 * - le sel du blind index est bien un secret DISTINCT de la clé de chiffrement
 */
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { normalizeEmail } from '../src/normalize'
import { startTestDb, type TestDb } from './helpers/testdb'

let t: TestDb

beforeAll(async () => {
  t = await startTestDb()
  await t.db.member.create({
    data: {
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alice.martin@example.org',
      phone: '+33600000001',
      address: '12 rue des Lilas, 75011 Paris',
      birthDate: '1994-03-12',
    },
  })
})

afterAll(async () => {
  await t.stop()
})

describe('chiffrement au repos (vérifié hors extension)', () => {
  it('stocke email, phone, address et birthDate chiffrés (format cloak v1.aesgcm256)', async () => {
    const rows = await t.rawDb.$queryRawUnsafe<
      Array<{ email: string; phone: string; address: string; birthDate: string }>
    >('SELECT email, phone, address, "birthDate" FROM "Member"')
    expect(rows).toHaveLength(1)
    const row = rows[0]
    if (!row) throw new Error('ligne manquante')
    for (const value of [row.email, row.phone, row.address, row.birthDate]) {
      expect(value).toMatch(/^v1\.aesgcm256\./)
      expect(value).not.toContain('alice')
      expect(value).not.toContain('Lilas')
    }
  })

  it('stocke firstName et lastName en clair (tri et recherche back-office, §6)', async () => {
    const rows = await t.rawDb.$queryRawUnsafe<Array<{ firstName: string; lastName: string }>>(
      'SELECT "firstName", "lastName" FROM "Member"',
    )
    expect(rows[0]).toEqual({ firstName: 'Alice', lastName: 'Martin' })
  })

  it('déchiffre de façon transparente via le client applicatif', async () => {
    const member = await t.db.member.findFirst({
      select: { email: true, phone: true, birthDate: true },
    })
    expect(member).toEqual({
      email: 'alice.martin@example.org',
      phone: '+33600000001',
      birthDate: '1994-03-12',
    })
  })
})

describe('blind index (§6) — point d’intégration le plus fragile de la stack', () => {
  it('remplit emailHash avec sha256(email normalisé + sel)', async () => {
    const rows = await t.rawDb.$queryRawUnsafe<Array<{ emailHash: string }>>(
      'SELECT "emailHash" FROM "Member"',
    )
    const expected = createHash('sha256')
      .update(normalizeEmail('alice.martin@example.org'))
      .update(t.hashSalt)
      .digest('hex')
    expect(rows[0]?.emailHash).toBe(expected)
  })

  it('le lookup where { email } passe par le blind index (ciphertext non déterministe)', async () => {
    // Si la recherche comparait le ciphertext, elle ne matcherait jamais :
    // chaque écriture produit un chiffré différent. Ce test casse si l'extension
    // cesse de réécrire la clause where vers emailHash.
    const found = await t.db.member.findFirst({
      where: { email: 'alice.martin@example.org' },
      select: { firstName: true },
    })
    expect(found?.firstName).toBe('Alice')
  })

  it('normalise la casse et les espaces à la recherche', async () => {
    const found = await t.db.member.findFirst({
      where: { email: '  ALICE.MARTIN@example.org ' },
      select: { firstName: true },
    })
    expect(found?.firstName).toBe('Alice')
  })

  it('ne matche pas un email inconnu', async () => {
    const found = await t.db.member.findFirst({ where: { email: 'autre@example.org' } })
    expect(found).toBeNull()
  })

  it('le hash dépend du sel : un sel différent produit un hash différent (clés séparées, §6)', async () => {
    const rows = await t.rawDb.$queryRawUnsafe<Array<{ emailHash: string }>>(
      'SELECT "emailHash" FROM "Member"',
    )
    const withOtherSalt = createHash('sha256')
      .update(normalizeEmail('alice.martin@example.org'))
      .update('un-autre-sel')
      .digest('hex')
    expect(rows[0]?.emailHash).not.toBe(withOtherSalt)
    // …et le sel n'est pas la clé de chiffrement elle-même
    expect(t.hashSalt).not.toBe(t.encryptionKey)
  })
})

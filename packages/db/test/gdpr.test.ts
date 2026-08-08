/**
 * RGPD (§6, §10) :
 * - deleteMemberData : effacement art. 17 en une opération, AUCUNE ligne orpheline
 * - exportMemberData : portabilité art. 20, données déchiffrées
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteMemberData, exportMemberData } from '../src/gdpr'
import { startTestDb, type TestDb } from './helpers/testdb'

let t: TestDb

beforeAll(async () => {
  t = await startTestDb()
})

afterAll(async () => {
  await t.stop()
})

async function createMemberWithActivity() {
  const member = await t.db.member.create({
    data: {
      firstName: 'Bruno',
      lastName: 'Bernard',
      email: `bruno-${Date.now()}@example.org`,
      phone: '+33600000002',
      birthDate: '1988-11-02',
    },
  })
  const token = await t.db.magicLinkToken.create({
    data: {
      tokenHash: `hash-${member.id}`,
      memberId: member.id,
      expiresAt: new Date(Date.now() + 600_000),
    },
  })
  await t.db.magicLinkUsage.create({
    data: { tokenId: token.id, ip: '203.0.113.7', userAgent: 'test-agent' },
  })
  await t.db.session.create({
    data: {
      tokenHash: `session-${member.id}`,
      memberId: member.id,
      expiresAt: new Date(Date.now() + 600_000),
      absoluteExpiresAt: new Date(Date.now() + 1_200_000),
    },
  })
  return member
}

describe('deleteMemberData (art. 17)', () => {
  it('supprime l’adhérent et TOUTES ses données liées en une opération', async () => {
    const member = await createMemberWithActivity()

    await deleteMemberData(t.db, member.id)

    const counts = await Promise.all([
      t.db.member.count({ where: { id: member.id } }),
      t.db.session.count({ where: { memberId: member.id } }),
      t.db.magicLinkToken.count({ where: { memberId: member.id } }),
    ])
    expect(counts).toEqual([0, 0, 0])

    // Aucune ligne orpheline nulle part (vérification globale hors extension)
    const orphanUsages = await t.rawDb.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*) AS count FROM "MagicLinkUsage" u
       LEFT JOIN "MagicLinkToken" t ON u."tokenId" = t.id WHERE t.id IS NULL`,
    )
    expect(Number(orphanUsages[0]?.count)).toBe(0)
    const orphanSessions = await t.rawDb.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*) AS count FROM "Session" s
       LEFT JOIN "Member" m ON s."memberId" = m.id WHERE m.id IS NULL`,
    )
    expect(Number(orphanSessions[0]?.count)).toBe(0)
  })

  it('échoue proprement sur un id inconnu (P2025)', async () => {
    await expect(deleteMemberData(t.db, 'id-inexistant')).rejects.toMatchObject({
      code: 'P2025',
    })
  })
})

describe('exportMemberData (art. 20)', () => {
  it('exporte les données déchiffrées, sans champs techniques', async () => {
    const member = await createMemberWithActivity()

    const exported = await exportMemberData(t.db, member.id)

    expect(exported.format).toBe('adherents/member-export')
    expect(exported.member.firstName).toBe('Bruno')
    expect(exported.member.phone).toBe('+33600000002')
    expect(exported.member.email).toContain('@example.org')
    // le blind index et les hash de tokens ne sortent jamais
    expect(JSON.stringify(exported)).not.toContain('emailHash')
    expect(JSON.stringify(exported)).not.toContain('tokenHash')
    expect(exported.member.sessions).toHaveLength(1)
  })
})

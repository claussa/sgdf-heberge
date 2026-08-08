import type { Db } from './client'

/**
 * Art. 17 — droit à l'effacement.
 * Une seule opération : les `onDelete: Cascade` du schéma suppriment sessions,
 * magic links et journaux d'utilisation. Testé (aucune ligne orpheline).
 */
export async function deleteMemberData(db: Db, memberId: string): Promise<void> {
  await db.member.delete({ where: { id: memberId } })
}

/**
 * Art. 20 — portabilité.
 * Export complet des données d'un adhérent, déchiffrées par l'extension.
 * `select` explicite : les champs techniques (emailHash, tokenHash) n'en font pas partie.
 */
export async function exportMemberData(db: Db, memberId: string) {
  const member = await db.member.findUniqueOrThrow({
    where: { id: memberId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      address: true,
      birthDate: true,
      emailStatus: true,
      createdAt: true,
      updatedAt: true,
      sessions: {
        select: { id: true, createdAt: true, expiresAt: true },
      },
    },
  })
  return {
    format: 'adherents/member-export',
    version: 1,
    member,
  }
}

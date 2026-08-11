import type { Db } from './client'

/**
 * Art. 17 — droit à l'effacement.
 * Une seule opération : les `onDelete: Cascade` du schéma suppriment sessions, magic links,
 * journaux, logements (→ couchages, → demandes reçues, → messages), demandes émises,
 * annonces et contacts jumelage. Testé (aucune ligne orpheline).
 *
 * ⚠️ La cascade est le FILET, pas le chemin nominal : côté API, `DELETE /me` passe par
 * `deleteUserAccount` (apps/api) qui annule d'abord les demandes ACCEPTED des deux côtés
 * et prévient les personnes concernées par email, PUIS appelle cette fonction.
 */
export async function deleteUserData(db: Db, userId: string): Promise<void> {
  await db.user.delete({ where: { id: userId } })
}

/**
 * Art. 20 — portabilité.
 * Export complet des données de l'utilisateur, déchiffrées par l'extension.
 * `select` explicite partout : les champs techniques (emailHash, tokenHash) n'en font
 * jamais partie, et les demandes REÇUES sur ses logements sont réduites à leurs
 * métadonnées (les PII des demandeurs appartiennent aux demandeurs).
 */
export async function exportUserData(db: Db, userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      accountType: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      groupSize: true,
      accessibilityNeeds: true,
      unitName: true,
      unitBranch: true,
      emailStatus: true,
      onboardedAt: true,
      seekerOnboardedAt: true,
      createdAt: true,
      updatedAt: true,
      sessions: {
        select: { id: true, createdAt: true, expiresAt: true },
      },
      listings: {
        select: {
          id: true,
          category: true,
          site: true,
          title: true,
          description: true,
          addressFull: true,
          displayArea: true,
          distanceKm: true,
          availableFrom: true,
          availableTo: true,
          status: true,
          hiddenAt: true,
          capacity: true,
          accessPmr: true,
          accessElectricWheelchair: true,
          accessFewSteps: true,
          accessHumanHelp: true,
          accessTransport: true,
          accessParking: true,
          accessAssistanceDog: true,
          accessQuiet: true,
          accessibilityNotes: true,
          priceInfo: true,
          bookingUrl: true,
          createdAt: true,
          beds: { select: { type: true, count: true, capacityEach: true, note: true } },
          // Demandes reçues : métadonnées seulement, pas les PII des demandeurs
          requests: {
            select: {
              id: true,
              status: true,
              dateFrom: true,
              dateTo: true,
              peopleCount: true,
              createdAt: true,
            },
          },
        },
      },
      lodgingRequests: {
        select: {
          id: true,
          listingId: true,
          dateFrom: true,
          dateTo: true,
          peopleCount: true,
          status: true,
          createdAt: true,
        },
      },
      // Tous les messages écrits PAR l'utilisateur (demandes émises comme reçues)
      requestMessages: {
        select: { id: true, requestId: true, body: true, createdAt: true },
      },
      jumelageAds: {
        select: {
          id: true,
          kind: true,
          site: true,
          dateFrom: true,
          dateTo: true,
          peopleLabel: true,
          description: true,
          status: true,
          createdAt: true,
        },
      },
      jumelageContacts: {
        select: { id: true, adId: true, message: true, status: true, createdAt: true },
      },
    },
  })
  return {
    format: 'heberge/user-export',
    version: 1,
    user,
  }
}

import type { AdminListingUpsertSchema } from '@repo/contracts'
import type { Db, ListingCategory, Prisma, RequestStatus } from '@repo/db'
import { renderRequestCancelledEmail } from '@repo/emails'
import { eventConfig } from '@repo/event-config'
import type { z } from 'zod'
import { getEnv } from '../env'
import { AppError } from '../errors'
import { computeDistanceKm, deriveDisplayArea } from '../lib/geocode'
import type { SessionUser } from './auth-service'
import { sendToRecipientAsync } from './notify'

/**
 * Espace admin (arbitrages 7 et 8 du plan v1) : métriques par site + CRUD des
 * logements institutionnels. Hôtels : fiche prix + bouton vers la plateforme de
 * l'hôtel (pas de demande in-app) ; gymnases/collectifs : flux de demande standard,
 * le logement appartient au compte admin qui l'a créé — mais TOUT admin peut
 * éditer TOUT logement institutionnel (petite équipe, pas de silo par compte).
 * Les logements PRIVATE des particuliers ne sont jamais accessibles par ces routes.
 */

type AdminListingUpsertInput = z.infer<typeof AdminListingUpsertSchema>

const INSTITUTIONAL_CATEGORIES: ListingCategory[] = ['HOTEL', 'COLLECTIVE']

// ---------------------------------------------------------------------------
// Select + mapping (institutionnels : capacité saisie, pas de lignes de couchages)
// ---------------------------------------------------------------------------

/**
 * Vue admin d'un logement institutionnel — même forme que MyListingSchema
 * (l'admin répond comme un hébergeur) : addressFull incluse, beds toujours vide.
 */
const ADMIN_LISTING_SELECT = {
  id: true,
  category: true,
  site: true,
  title: true,
  displayArea: true,
  distanceKm: true,
  capacity: true,
  availableFrom: true,
  availableTo: true,
  priceInfo: true,
  bookingUrl: true,
  description: true,
  accessibilityNotes: true,
  parkingEase: true,
  status: true,
  hiddenAt: true,
  addressFull: true,
  accessPmr: true,
  accessElectricWheelchair: true,
  accessFewSteps: true,
  accessHumanHelp: true,
  accessTransport: true,
  accessParking: true,
  accessAssistanceDog: true,
  accessQuiet: true,
  _count: { select: { requests: { where: { status: 'PENDING' } } } },
  // Remplissage « 12/80 places » — même agrégat que la vue propriétaire.
  requests: { where: { status: 'ACCEPTED' }, select: { peopleCount: true } },
} as const satisfies Prisma.ListingSelect

type AdminListingRow = Prisma.ListingGetPayload<{ select: typeof ADMIN_LISTING_SELECT }>

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function toAdminListing(row: AdminListingRow) {
  return {
    id: row.id,
    category: row.category,
    site: row.site,
    title: row.title ?? 'Hébergement',
    displayArea: row.displayArea,
    distanceKm: row.distanceKm,
    capacity: row.capacity,
    availableFrom: isoDate(row.availableFrom),
    availableTo: isoDate(row.availableTo),
    access: {
      pmr: row.accessPmr,
      electricWheelchair: row.accessElectricWheelchair,
      fewSteps: row.accessFewSteps,
      humanHelp: row.accessHumanHelp,
      transport: row.accessTransport,
      parking: row.accessParking,
      assistanceDog: row.accessAssistanceDog,
      quiet: row.accessQuiet,
    },
    // Institutionnels : capacité directe, pas de lignes de couchages.
    bedTypes: [],
    beds: [],
    priceInfo: row.priceInfo,
    description: row.description,
    accessibilityNotes: row.accessibilityNotes,
    // Institutionnels : jamais saisi par l'admin en v1 — la jauge n'apparaît pas.
    parkingEase: row.parkingEase,
    // Ils s'identifient par leur title, jamais par le compte admin qui les gère.
    hostDisplayName: null,
    bookingUrl: row.bookingUrl,
    status: row.status,
    hiddenAt: row.hiddenAt ? row.hiddenAt.toISOString() : null,
    addressFull: row.addressFull,
    pendingRequests: row._count.requests,
    acceptedPeople: row.requests.reduce((sum, request) => sum + request.peopleCount, 0),
  }
}

function assertDateRange(input: AdminListingUpsertInput): void {
  if (input.availableFrom >= input.availableTo) {
    throw new AppError('VALIDATION_ERROR', 'La date de début doit précéder la date de fin')
  }
}

/** Colonnes écrites — displayArea/distanceKm dérivées comme pour un logement privé. */
function institutionalData(input: AdminListingUpsertInput) {
  return {
    category: input.category,
    site: input.site,
    title: input.title,
    description: input.description ?? null,
    // Libellé BAN complet, chiffré par l'extension ; seule displayArea est publique.
    addressFull: input.address.label,
    displayArea: deriveDisplayArea(input.address),
    distanceKm: computeDistanceKm(input.site, input.address),
    capacity: input.capacity,
    priceInfo: input.priceInfo ?? null,
    bookingUrl: input.bookingUrl ?? null,
    availableFrom: new Date(input.availableFrom),
    availableTo: new Date(input.availableTo),
    accessPmr: input.access.pmr,
    accessElectricWheelchair: input.access.electricWheelchair,
    accessFewSteps: input.access.fewSteps,
    accessHumanHelp: input.access.humanHelp,
    accessTransport: input.access.transport,
    accessParking: input.access.parking,
    accessAssistanceDog: input.access.assistanceDog,
    accessQuiet: input.access.quiet,
    accessibilityNotes: input.accessibilityNotes ?? null,
  }
}

async function readInstitutionalListing(db: Db, listingId: string) {
  const row = await db.listing.findFirst({
    where: { id: listingId, category: { in: INSTITUTIONAL_CATEGORIES } },
    select: ADMIN_LISTING_SELECT,
  })
  if (!row) throw new AppError('NOT_FOUND', 'Logement institutionnel introuvable')
  return toAdminListing(row)
}

// ---------------------------------------------------------------------------
// CRUD institutionnel
// ---------------------------------------------------------------------------

/** Création — owner = l'admin courant (il répondra aux demandes comme un hébergeur). */
export async function createInstitutionalListing(
  db: Db,
  admin: SessionUser,
  input: AdminListingUpsertInput,
) {
  assertDateRange(input)
  const created = await db.listing.create({
    data: { ownerId: admin.id, ...institutionalData(input) },
    select: { id: true },
  })
  return readInstitutionalListing(db, created.id)
}

/**
 * Mise à jour (corps complet, pas de partiel). N'importe quel admin peut éditer
 * n'importe quel logement HOTEL/COLLECTIVE — le WHERE sur la catégorie garantit
 * qu'un logement PRIVATE d'un particulier n'est JAMAIS modifiable par ces routes.
 */
export async function updateInstitutionalListing(
  db: Db,
  listingId: string,
  input: AdminListingUpsertInput,
) {
  assertDateRange(input)
  const updated = await db.listing.updateMany({
    where: { id: listingId, category: { in: INSTITUTIONAL_CATEGORIES } },
    data: institutionalData(input),
  })
  if (updated.count === 0) {
    throw new AppError('NOT_FOUND', 'Logement institutionnel introuvable')
  }
  return readInstitutionalListing(db, listingId)
}

/**
 * Suppression — pattern deleteUserAccount/deleteListing : la cascade DB est le
 * filet, pas le chemin nominal. On annule d'abord les demandes ACCEPTED et on
 * prévient chaque demandeur (un hébergement ne disparaît pas silencieusement),
 * PUIS on supprime.
 */
export async function deleteInstitutionalListing(db: Db, listingId: string): Promise<void> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, category: { in: INSTITUTIONAL_CATEGORIES } },
    select: { id: true, title: true },
  })
  if (!listing) throw new AppError('NOT_FOUND', 'Logement institutionnel introuvable')

  const accepted = await db.lodgingRequest.findMany({
    where: { listingId, status: 'ACCEPTED' },
    select: {
      id: true,
      requester: { select: { firstName: true, email: true, emailStatus: true } },
    },
  })
  if (accepted.length > 0) {
    await db.lodgingRequest.updateMany({
      where: { listingId, status: 'ACCEPTED' },
      data: { status: 'CANCELLED', cancelledBy: 'HOST' },
    })
  }

  // Notifications APRÈS l'écriture, jamais dans une transaction (règle d'intégrité 4),
  // idempotentes par demande.
  const appOrigin = getEnv().APP_ORIGIN
  for (const request of accepted) {
    const rendered = await renderRequestCancelledEmail({
      toFirstName: request.requester.firstName,
      listingTitle: listing.title ?? 'Hébergement',
      cancelledByLabel: "l'hébergeur",
      actionUrl: `${appOrigin}/mes-demandes`,
    })
    sendToRecipientAsync(request.requester, {
      ...rendered,
      idempotencyKey: `cancelled/${request.id}`,
    })
  }

  await db.listing.delete({ where: { id: listingId } })
}

/** Liste de tous les logements institutionnels (les deux catégories, tous sites). */
export async function listInstitutionalListings(db: Db) {
  const rows = await db.listing.findMany({
    where: { category: { in: INSTITUTIONAL_CATEGORIES } },
    select: ADMIN_LISTING_SELECT,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toAdminListing)
}

// ---------------------------------------------------------------------------
// Métriques par site (AdminMetricsSchema) — groupBy/count Prisma, jamais de $queryRaw
// ---------------------------------------------------------------------------

export async function getMetrics(db: Db) {
  const [activeGroups, hiddenGroups, adGroups, userGroups] = await Promise.all([
    db.listing.groupBy({
      by: ['site', 'category'],
      where: { hiddenAt: null },
      _count: { _all: true },
      _sum: { capacity: true },
    }),
    db.listing.groupBy({
      by: ['site', 'category'],
      where: { hiddenAt: { not: null } },
      _count: { _all: true },
    }),
    db.jumelageAd.groupBy({
      by: ['site', 'kind'],
      where: { status: 'ACTIVE' },
      _count: { _all: true },
    }),
    db.user.groupBy({ by: ['accountType'], _count: { _all: true } }),
  ])

  const sites = await Promise.all(
    eventConfig.sites.map(async (site) => {
      // groupBy ne porte pas sur un champ de relation : une requête par site.
      const [requestGroups, relations] = await Promise.all([
        db.lodgingRequest.groupBy({
          by: ['status'],
          where: { listing: { site: site.slug } },
          _count: { _all: true },
        }),
        db.jumelageContact.count({
          where: { status: 'ACCEPTED', ad: { site: site.slug } },
        }),
      ])

      const active = (category: ListingCategory) =>
        activeGroups.find((g) => g.site === site.slug && g.category === category)?._count._all ?? 0
      const hidden = (category: ListingCategory) =>
        hiddenGroups.find((g) => g.site === site.slug && g.category === category)?._count._all ?? 0
      const requests = (status: RequestStatus) =>
        requestGroups.find((g) => g.status === status)?._count._all ?? 0
      const ads = (kind: 'SEEKING' | 'HOSTING') =>
        adGroups.find((g) => g.site === site.slug && g.kind === kind)?._count._all ?? 0

      return {
        site: site.slug,
        listings: {
          privateActive: active('PRIVATE'),
          privateHidden: hidden('PRIVATE'),
          hotel: active('HOTEL') + hidden('HOTEL'),
          collective: active('COLLECTIVE') + hidden('COLLECTIVE'),
          // Capacité offerte = somme des logements non masqués (toutes catégories).
          totalCapacity: activeGroups
            .filter((g) => g.site === site.slug)
            .reduce((sum, g) => sum + (g._sum.capacity ?? 0), 0),
        },
        requests: {
          pending: requests('PENDING'),
          accepted: requests('ACCEPTED'),
          declined: requests('DECLINED'),
          expired: requests('EXPIRED'),
          cancelled: requests('CANCELLED'),
        },
        jumelage: {
          seeking: ads('SEEKING'),
          hosting: ads('HOSTING'),
          relations,
        },
      }
    }),
  )

  const users = (accountType: 'INDIVIDUAL' | 'SCOUT_UNIT' | null) =>
    userGroups.find((g) => g.accountType === accountType)?._count._all ?? 0

  return {
    sites,
    users: {
      individuals: users('INDIVIDUAL'),
      units: users('SCOUT_UNIT'),
      // Coquilles : magic link demandé, onboarding jamais terminé.
      shells: users(null),
    },
  }
}

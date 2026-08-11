import type {
  AccessCriterion,
  ListingSearchQuerySchema,
  ListingUpdateInput,
  ListingUpsertInput,
  ParkingEase,
  SearchType,
} from '@repo/contracts'
import type { Db, ListingStatus, Prisma } from '@repo/db'
import { renderRequestCancelledEmail } from '@repo/emails'
import type { z } from 'zod'
import { getEnv } from '../env'
import { AppError } from '../errors'
import { computeDistanceKm, deriveDisplayArea } from '../lib/geocode'
import { hostDisplayName, listingCardTitle, listingOwnerTitle } from './listing-title'
import { sendToRecipientAsync } from './notify'

/**
 * Logique métier des logements (plan v1 « Routes logements »). Ne connaît pas HTTP (§4) :
 * les erreurs sont des AppError, les DTO sortants sont re-parsés par les routes (§5).
 * Tous les accès passent par des select EXPLICITES — Listing porte addressFull chiffrée,
 * qui ne sort QUE dans la vue propriétaire (révélée au demandeur à l'acceptation ailleurs).
 */

type ListingSearchQuery = z.infer<typeof ListingSearchQuerySchema>

/** Client utilisable dans une $transaction interactive (l'extension de chiffrement s'applique). */
export type Tx = Omit<Db, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

// ---------------------------------------------------------------------------
// Selects explicites (§5 — jamais de findMany nu sur une table à PII)
// ---------------------------------------------------------------------------

const BED_SELECT = { type: true, count: true, capacityEach: true, note: true } as const

const ACCESS_SELECT = {
  accessPmr: true,
  accessElectricWheelchair: true,
  accessFewSteps: true,
  accessHumanHelp: true,
  accessTransport: true,
  accessParking: true,
  accessAssistanceDog: true,
  accessQuiet: true,
} as const

/** Carte de recherche — JAMAIS addressFull dans un résultat de recherche. */
const CARD_SELECT = {
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
  parkingEase: true,
  ...ACCESS_SELECT,
  beds: { select: BED_SELECT },
} as const satisfies Prisma.ListingSelect

const DETAIL_SELECT = {
  ...CARD_SELECT,
  ownerId: true,
  description: true,
  accessibilityNotes: true,
  bookingUrl: true,
  hiddenAt: true,
  owner: { select: { firstName: true, lastName: true } },
} as const satisfies Prisma.ListingSelect

/** Vue propriétaire — la SEULE qui expose addressFull (sa propre adresse, déchiffrée). */
const MY_LISTING_SELECT = {
  ...DETAIL_SELECT,
  addressFull: true,
  status: true,
  _count: { select: { requests: { where: { status: 'PENDING' } } } },
} as const satisfies Prisma.ListingSelect

type CardRow = Prisma.ListingGetPayload<{ select: typeof CARD_SELECT }>
type DetailRow = Prisma.ListingGetPayload<{ select: typeof DETAIL_SELECT }>
type MyListingRow = Prisma.ListingGetPayload<{ select: typeof MY_LISTING_SELECT }>

// ---------------------------------------------------------------------------
// Mapping DTO (dates @db.Date → 'YYYY-MM-DD', colonnes accessXxx → grille)
// ---------------------------------------------------------------------------

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function accessGrid(row: CardRow) {
  return {
    pmr: row.accessPmr,
    electricWheelchair: row.accessElectricWheelchair,
    fewSteps: row.accessFewSteps,
    humanHelp: row.accessHumanHelp,
    transport: row.accessTransport,
    parking: row.accessParking,
    assistanceDog: row.accessAssistanceDog,
    quiet: row.accessQuiet,
  }
}

/** Liste EXHAUSTIVE des champs publics d'une carte (minimisation §5). */
function toCard(row: CardRow) {
  return {
    id: row.id,
    category: row.category,
    site: row.site,
    title: listingCardTitle(row),
    displayArea: row.displayArea,
    distanceKm: row.distanceKm,
    capacity: row.capacity,
    availableFrom: isoDate(row.availableFrom),
    availableTo: isoDate(row.availableTo),
    access: accessGrid(row),
    parkingEase: row.parkingEase,
    bedTypes: [...new Set(row.beds.map((bed) => bed.type))],
    priceInfo: row.priceInfo,
  }
}

function toDetail(row: DetailRow) {
  return {
    ...toCard(row),
    description: row.description,
    accessibilityNotes: row.accessibilityNotes,
    // « chez Claire M. » — les institutionnels s'identifient par leur title, pas par
    // le compte admin qui les gère.
    hostDisplayName: row.category === 'PRIVATE' ? hostDisplayName(row.owner) : null,
    beds: row.beds.map((bed) => ({
      type: bed.type,
      count: bed.count,
      capacityEach: bed.capacityEach,
      note: bed.note,
    })),
    bookingUrl: row.bookingUrl,
  }
}

function toMyListing(row: MyListingRow) {
  return {
    ...toDetail(row),
    title: listingOwnerTitle({
      category: row.category,
      title: row.title,
      beds: row.beds,
      ownerFirstName: row.owner.firstName,
    }),
    status: row.status,
    hiddenAt: row.hiddenAt ? row.hiddenAt.toISOString() : null,
    addressFull: row.addressFull,
    pendingRequests: row._count.requests,
  }
}

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

/**
 * Recalcul COMPLET de la capacité dénormalisée : Σ (count × capacityEach), jamais
 * d'incrémental. À appeler dans la MÊME transaction que TOUTE écriture de couchages
 * (le job quotidien re-synchronise par-dessus, auto-guérison de la dénormalisation).
 */
export async function syncListingCapacity(tx: Tx, listingId: string): Promise<void> {
  const beds = await tx.listingBed.findMany({
    where: { listingId },
    select: { count: true, capacityEach: true },
  })
  const capacity = beds.reduce((sum, bed) => sum + bed.count * bed.capacityEach, 0)
  await tx.listing.update({ where: { id: listingId }, data: { capacity } })
}

function assertDateRange(input: { availableFrom: string; availableTo: string }): void {
  if (input.availableFrom >= input.availableTo) {
    throw new AppError('VALIDATION_ERROR', 'La date de début doit précéder la date de fin')
  }
}

/** Colonnes dérivées du corps d'upsert — la catégorie n'est JAMAIS pilotée par ce corps. */
function commonListingData(input: Omit<ListingUpsertInput, 'address'>) {
  return {
    site: input.site,
    availableFrom: new Date(input.availableFrom),
    availableTo: new Date(input.availableTo),
    description: input.description ?? null,
    accessPmr: input.access.pmr,
    accessElectricWheelchair: input.access.electricWheelchair,
    accessFewSteps: input.access.fewSteps,
    accessHumanHelp: input.access.humanHelp,
    accessTransport: input.access.transport,
    accessParking: input.access.parking,
    accessAssistanceDog: input.access.assistanceDog,
    accessQuiet: input.access.quiet,
    accessibilityNotes: input.accessibilityNotes ?? null,
    parkingEase: input.parkingEase ?? null,
  }
}

function addressListingData(site: string, address: ListingUpsertInput['address']) {
  return {
    // Libellé BAN complet, chiffré par l'extension ; seule displayArea est publique.
    addressFull: address.label,
    displayArea: deriveDisplayArea(address),
    distanceKm: computeDistanceKm(site, address),
  }
}

function listingData(input: ListingUpsertInput) {
  return { ...commonListingData(input), ...addressListingData(input.site, input.address) }
}

function bedRows(listingId: string, beds: ListingUpsertInput['beds']) {
  return beds.map((bed) => ({
    listingId,
    type: bed.type,
    count: bed.count,
    capacityEach: bed.capacityEach,
    note: bed.note ?? null,
  }))
}

async function getMyListing(db: Db, ownerId: string, listingId: string) {
  const row = await db.listing.findFirst({
    where: { id: listingId, ownerId },
    select: MY_LISTING_SELECT,
  })
  if (!row) throw new AppError('NOT_FOUND', 'Logement introuvable')
  return toMyListing(row)
}

/** Tout INDIVIDUAL peut créer un logement (= devenir hébergeur). Catégorie PRIVATE forcée. */
export async function createListing(db: Db, ownerId: string, input: ListingUpsertInput) {
  assertDateRange(input)
  const listingId = await db.$transaction(async (tx) => {
    const created = await tx.listing.create({
      data: { ownerId, category: 'PRIVATE', ...listingData(input) },
      select: { id: true },
    })
    await tx.listingBed.createMany({ data: bedRows(created.id, input.beds) })
    await syncListingCapacity(tx, created.id)
    return created.id
  })
  return getMyListing(db, ownerId, listingId)
}

/**
 * Ownership vérifié dans le WHERE — NOT_FOUND si le logement n'est pas au compte,
 * sans distinction 403/404 (ne pas révéler l'existence d'un logement d'autrui, §9).
 */
export async function updateListing(
  db: Db,
  ownerId: string,
  listingId: string,
  input: ListingUpdateInput,
  now = new Date(),
) {
  assertDateRange(input)
  await db.$transaction(async (tx) => {
    const owned = await tx.listing.findFirst({
      where: { id: listingId, ownerId },
      select: { id: true, site: true },
    })
    if (!owned) throw new AppError('NOT_FOUND', 'Logement introuvable')
    // Adresse absente = conservée telle quelle ; si le site change sans nouvelle
    // adresse, la distance devient null (les coordonnées ne sont pas stockées).
    const addressData = input.address
      ? addressListingData(input.site, input.address)
      : input.site !== owned.site
        ? { distanceKm: null }
        : {}
    await tx.listing.update({
      where: { id: listingId },
      data: { ...commonListingData(input), ...addressData, lastHostActivityAt: now },
    })
    // Couchages : remplacement complet, puis recalcul complet — jamais d'incrémental.
    await tx.listingBed.deleteMany({ where: { listingId } })
    await tx.listingBed.createMany({ data: bedRows(listingId, input.beds) })
    await syncListingCapacity(tx, listingId)
  })
  return getMyListing(db, ownerId, listingId)
}

/**
 * OPEN/FULL, à la main de l'hébergeur. Action explicite = hébergeur actif : hiddenAt
 * est TOUJOURS remis à null (c'est le geste de réactivation après masquage automatique)
 * et lastHostActivityAt est touchée (anti-faux-positif du masquage).
 */
export async function setListingStatus(
  db: Db,
  ownerId: string,
  listingId: string,
  status: ListingStatus,
  now = new Date(),
) {
  const updated = await db.listing.updateMany({
    where: { id: listingId, ownerId },
    data: { status, hiddenAt: null, lastHostActivityAt: now },
  })
  if (updated.count === 0) throw new AppError('NOT_FOUND', 'Logement introuvable')
  return getMyListing(db, ownerId, listingId)
}

/**
 * Suppression d'un logement — même principe que deleteUserAccount : la cascade DB est
 * le filet, pas le chemin nominal. On annule d'abord les demandes ACCEPTED et on
 * prévient chaque demandeur (un hébergement ne disparaît pas silencieusement à J−3),
 * PUIS on supprime (cascade couchages / demandes / messages).
 */
export async function deleteListing(db: Db, ownerId: string, listingId: string): Promise<void> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, ownerId },
    select: {
      id: true,
      category: true,
      title: true,
      beds: { select: { type: true, count: true, capacityEach: true } },
      owner: { select: { firstName: true } },
    },
  })
  if (!listing) throw new AppError('NOT_FOUND', 'Logement introuvable')

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
  const listingTitle = listingOwnerTitle({
    category: listing.category,
    title: listing.title,
    beds: listing.beds,
    ownerFirstName: listing.owner.firstName,
  })
  for (const request of accepted) {
    const rendered = await renderRequestCancelledEmail({
      toFirstName: request.requester.firstName,
      listingTitle,
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

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

const ACCESS_COLUMNS: Record<AccessCriterion, keyof typeof ACCESS_SELECT> = {
  pmr: 'accessPmr',
  electricWheelchair: 'accessElectricWheelchair',
  fewSteps: 'accessFewSteps',
  humanHelp: 'accessHumanHelp',
  transport: 'accessTransport',
  parking: 'accessParking',
  assistanceDog: 'accessAssistanceDog',
  quiet: 'accessQuiet',
}

/** Filtre stationnement = facilité MINIMALE : MEDIUM accepte EASY et MEDIUM, null exclu. */
const PARKING_AT_LEAST: Record<ParkingEase, ParkingEase[]> = {
  EASY: ['EASY'],
  MEDIUM: ['EASY', 'MEDIUM'],
  HARD: ['EASY', 'MEDIUM', 'HARD'],
}

/**
 * Recherche publique : uniquement les logements OPEN et non masqués du site, couvrant
 * les dates demandées (chaque borne appliquée seulement si fournie), de capacité
 * suffisante. Chips « Type » : OR entre types de couchages et catégories
 * institutionnelles ; accessibilité : AND sur chaque critère coché ; stationnement :
 * facilité minimale (non renseigné = exclu dès qu'un niveau est exigé).
 */
export async function searchListings(db: Db, query: ListingSearchQuery) {
  const types = query.types ?? []
  const bedTypes = types.filter(
    (type): type is Exclude<SearchType, 'HOTEL' | 'COLLECTIVE'> =>
      type !== 'HOTEL' && type !== 'COLLECTIVE',
  )
  const categories = types.filter(
    (type): type is Extract<SearchType, 'HOTEL' | 'COLLECTIVE'> =>
      type === 'HOTEL' || type === 'COLLECTIVE',
  )
  const typeConditions: Prisma.ListingWhereInput[] = []
  if (bedTypes.length > 0) typeConditions.push({ beds: { some: { type: { in: bedTypes } } } })
  if (categories.length > 0) typeConditions.push({ category: { in: categories } })

  const where: Prisma.ListingWhereInput = {
    site: query.site,
    status: 'OPEN',
    hiddenAt: null,
    ...(query.from ? { availableFrom: { lte: new Date(query.from) } } : {}),
    ...(query.to ? { availableTo: { gte: new Date(query.to) } } : {}),
    ...(query.people !== undefined ? { capacity: { gte: query.people } } : {}),
    ...(typeConditions.length > 0 ? { OR: typeConditions } : {}),
    ...(query.parking ? { parkingEase: { in: PARKING_AT_LEAST[query.parking] } } : {}),
  }
  for (const criterion of query.access ?? []) {
    where[ACCESS_COLUMNS[criterion]] = true
  }

  const [rows, total] = await Promise.all([
    db.listing.findMany({
      where,
      select: CARD_SELECT,
      orderBy: [{ distanceKm: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.listing.count({ where }),
  ])

  return { items: rows.map(toCard), total, page: query.page, pageSize: query.pageSize }
}

/**
 * Fiche publique. Un logement masqué (hiddenAt) reste visible pour son propriétaire —
 * pour les autres il n'existe pas (null → 404, pas de distinction).
 */
export async function getListingDetail(db: Db, listingId: string, viewerId?: string) {
  const row = await db.listing.findFirst({ where: { id: listingId }, select: DETAIL_SELECT })
  if (!row) return null
  if (row.hiddenAt && row.ownerId !== viewerId) return null
  return toDetail(row)
}

/** Liste « Mes logements » — vue propriétaire (addressFull, statut, demandes en attente). */
export async function getMyListings(db: Db, ownerId: string) {
  const rows = await db.listing.findMany({
    where: { ownerId },
    select: MY_LISTING_SELECT,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toMyListing)
}

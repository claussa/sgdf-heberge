import {
  MyRequestsResponseSchema,
  ReceivedRequestsResponseSchema,
  type RequestCreateInput,
} from '@repo/contracts'
import { type Db, Prisma, type RequestStatus } from '@repo/db'
import {
  renderRequestAcceptedEmail,
  renderRequestCancelledEmail,
  renderRequestDeclinedEmail,
  renderRequestMessageEmail,
  renderRequestReceivedEmail,
} from '@repo/emails'
import { formatDateRangeLong } from '@repo/event-config'
import type { z } from 'zod'
import { getEnv } from '../env'
import { AppError } from '../errors'
import { hostDisplayName, listingCardTitle, listingOwnerTitle } from './listing-title'
import { sendToRecipientAsync } from './notify'
import { parseAccessibilityNeeds } from './user-service'

/**
 * Cycle de vie des demandes d'hébergement — le cœur du système (plan v1).
 *
 * Règles d'intégrité (LOI, revue d'architecture) :
 *   1. AUCUNE transition par SELECT-puis-UPDATE : toujours un compare-and-swap
 *      `updateMany` conditionnel + vérification du count (0 → 409). Le WHERE des
 *      transitions de PENDING inclut TOUJOURS le prédicat d'expiration
 *      (`lastActivityAt ≥ now − 7 j`) : une demande logiquement périmée est
 *      intouchable AVANT même le passage du job quotidien.
 *   2. Verrou advisory par demandeur en tête des transactions création / accept /
 *      cancel : sérialise le quota et les accepts concurrents, supprime le deadlock
 *      croisé (deux hébergeurs acceptant le même demandeur). C'est la SEULE
 *      exception admise à l'interdit $queryRaw (§6) : ne touche aucune table.
 *   3. Retry unique sur P2034 (deadlock/serialization) autour des transitions.
 *   4. JAMAIS d'envoi d'email dans une $transaction — envoi APRÈS commit, avec
 *      idempotency key Resend par événement (un retry ne double jamais un email).
 *   5. L'auto-annulation des demandes sœurs a `status: 'PENDING'` dans son WHERE :
 *      elle ne peut jamais toucher une demande ACCEPTED (d'un autre hébergeur).
 */

/** Plafond de sollicitations PENDING simultanées par demandeur (bandeau « 3/3 »). */
export const REQUEST_PENDING_LIMIT = 3
/** 7 jours sans activité → demande expirée (matérialisée par le job, vérifiée à l'écriture). */
export const REQUEST_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000
/** Relance quotidienne à partir de 24 h d'inactivité (arbitrage 15 : une par jour). */
export const REQUEST_REMINDER_AFTER_MS = 24 * 60 * 60 * 1000

/** Client utilisable dans une $transaction interactive (l'extension de chiffrement s'applique). */
export type Tx = Omit<Db, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

interface Actor {
  id: string
}

interface RequesterActor extends Actor {
  firstName: string | null
  lastName: string | null
  phone: string | null
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}

/** Règle d'intégrité 3 : retry unique sur P2034, jamais plus (pas de boucle infinie). */
export async function retryOnceOnP2034<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!isPrismaError(error, 'P2034')) throw error
    return await run()
  }
}

/**
 * Transaction ouverte par un verrou advisory scoped au demandeur (règle 2).
 * `pg_advisory_xact_lock` est relâché automatiquement au commit/rollback ;
 * `hashtext` réduit la clé texte à un int32 — collision théorique possible, sans
 * autre effet qu'une sérialisation superflue. Prisma.sql = requête PARAMÉTRÉE.
 */
export async function withRequesterLock<T>(
  db: Db,
  requesterId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return retryOnceOnP2034(() =>
    db.$transaction(
      async (tx) => {
        // $executeRaw et non $queryRaw : pg_advisory_xact_lock retourne un `void`
        // que Prisma ne sait pas désérialiser ; on n'attend aucun résultat.
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`requester:${requesterId}`}))`,
        )
        return fn(tx)
      },
      { timeout: 15_000 },
    ),
  )
}

/** Borne de péremption : une PENDING dont lastActivityAt est antérieure est morte. */
function expiryCutoff(now: Date): Date {
  return new Date(now.getTime() - REQUEST_EXPIRY_MS)
}

// ---------------------------------------------------------------------------
// Selects explicites (§5 — jamais de findMany nu sur une table à PII)
// ---------------------------------------------------------------------------

const BED_TITLE_SELECT = { type: true, count: true, capacityEach: true } as const

/** Données minimales d'un destinataire de notification (garde bounce dans notify). */
const RECIPIENT_SELECT = { firstName: true, email: true, emailStatus: true } as const

interface TitledListing {
  category: 'PRIVATE' | 'HOTEL' | 'COLLECTIVE'
  title: string | null
  capacity: number
  beds: {
    type: 'PRIVATE_ROOM' | 'COUCH' | 'FLOOR_BED' | 'TENT_SPOT'
    count: number
    capacityEach: number
  }[]
}

/** Titre côté hébergeur (« Chez Claire — 2 chambres privées ») pour ses propres emails. */
function ownerTitle(listing: TitledListing & { owner: { firstName: string | null } }): string {
  return listingOwnerTitle({
    category: listing.category,
    title: listing.title,
    beds: listing.beds,
    ownerFirstName: listing.owner.firstName,
  })
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Création (POST /listings/:id/requests)
// ---------------------------------------------------------------------------

const CREATE_LISTING_SELECT = {
  id: true,
  ownerId: true,
  category: true,
  status: true,
  hiddenAt: true,
  availableFrom: true,
  availableTo: true,
  title: true,
  capacity: true,
  beds: { select: BED_TITLE_SELECT },
  owner: { select: RECIPIENT_SELECT },
} as const satisfies Prisma.ListingSelect

/**
 * Crée une demande + son message initial dans la même transaction, sous verrou
 * demandeur (le quota et l'anti-doublon sont vérifiés SOUS le verrou : deux
 * créations concurrentes ne peuvent pas dépasser le plafond).
 */
export async function createRequest(
  db: Db,
  requester: RequesterActor,
  listingId: string,
  input: RequestCreateInput,
  now = new Date(),
): Promise<{ requestId: string }> {
  let created: {
    requestId: string
    owner: Prisma.UserGetPayload<{ select: typeof RECIPIENT_SELECT }>
    listingTitle: string
  }
  try {
    created = await withRequesterLock(db, requester.id, async (tx) => {
      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        select: CREATE_LISTING_SELECT,
      })
      // Un logement masqué « n'existe pas » pour les autres : même réponse que
      // l'inexistant, pour ne pas révéler son existence (§9).
      if (!listing || listing.hiddenAt !== null) {
        throw new AppError('NOT_FOUND', 'Logement introuvable')
      }
      if (listing.ownerId === requester.id) {
        throw new AppError('CONFLICT', 'Tu ne peux pas solliciter ton propre logement')
      }
      if (listing.category === 'HOTEL') {
        // Arbitrage 7 : les hôtels se réservent sur leur propre plateforme, pas in-app.
        throw new AppError('CONFLICT', "Cet hébergement se réserve sur la plateforme de l'hôtel")
      }
      if (listing.status !== 'OPEN') {
        throw new AppError('CONFLICT', 'Ce logement est complet')
      }

      const dateFrom = new Date(input.dateFrom)
      const dateTo = new Date(input.dateTo)
      if (dateFrom.getTime() >= dateTo.getTime()) {
        throw new AppError('VALIDATION_ERROR', "La date d'arrivée doit précéder la date de départ")
      }
      if (dateFrom < listing.availableFrom || dateTo > listing.availableTo) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Les dates demandées sortent de la période de disponibilité du logement',
        )
      }

      // Quota : seuls les PENDING NON périmés comptent (une demande morte libère son slot
      // avant même que le job la matérialise EXPIRED).
      const pendingCount = await tx.lodgingRequest.count({
        where: {
          requesterId: requester.id,
          status: 'PENDING',
          lastActivityAt: { gte: expiryCutoff(now) },
        },
      })
      if (pendingCount >= REQUEST_PENDING_LIMIT) {
        throw new AppError(
          'CONFLICT',
          `Tu as déjà ${REQUEST_PENDING_LIMIT} sollicitations en attente`,
        )
      }

      // Anti-doublon explicite SOUS verrou — l'index partiel LodgingRequest_active_uniq
      // reste le filet au niveau DB (P2002 mappé ci-dessous).
      const duplicate = await tx.lodgingRequest.findFirst({
        where: {
          listingId,
          requesterId: requester.id,
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
        select: { id: true },
      })
      if (duplicate) {
        throw new AppError('CONFLICT', 'Demande déjà en cours pour ce logement')
      }

      const request = await tx.lodgingRequest.create({
        data: {
          listingId,
          requesterId: requester.id,
          dateFrom,
          dateTo,
          peopleCount: input.peopleCount,
          status: 'PENDING',
          awaitingSide: 'HOST',
          lastActivityAt: now,
        },
        select: { id: true },
      })
      // Le message initial = 1re ligne du fil, même transaction (pas de colonne message).
      await tx.requestMessage.create({
        data: { requestId: request.id, senderId: requester.id, body: input.message },
      })

      // Filet de sécurité : émettre une demande active l'espace volontaire (nav),
      // même si le compte n'est pas passé par le parcours « Je cherche un logement ».
      await tx.user.updateMany({
        where: { id: requester.id, seekerOnboardedAt: null },
        data: { seekerOnboardedAt: now },
      })

      return { requestId: request.id, owner: listing.owner, listingTitle: ownerTitle(listing) }
    })
  } catch (error) {
    if (isPrismaError(error, 'P2002')) {
      throw new AppError('CONFLICT', 'Demande déjà en cours pour ce logement')
    }
    throw error
  }

  // APRÈS commit (règle 4) — fire-and-forget, idempotent par demande.
  const rendered = await renderRequestReceivedEmail({
    hostFirstName: created.owner.firstName ?? '',
    requesterFirstName: requester.firstName ?? '',
    requesterLastName: requester.lastName ?? '',
    requesterPhone: requester.phone ?? '',
    peopleCount: input.peopleCount,
    dateRange: formatDateRangeLong(input.dateFrom, input.dateTo),
    listingTitle: created.listingTitle,
    message: input.message,
    actionUrl: `${getEnv().APP_ORIGIN}/hebergeur/demandes`,
  })
  sendToRecipientAsync(created.owner, {
    ...rendered,
    idempotencyKey: `received/${created.requestId}`,
  })

  return { requestId: created.requestId }
}

// ---------------------------------------------------------------------------
// Acceptation (POST /requests/:id/accept)
// ---------------------------------------------------------------------------

/**
 * Accepte une demande et annule automatiquement les AUTRES PENDING du demandeur
 * (arbitrage 4) — le tout sous verrou demandeur, en une transaction. Les
 * coordonnées complètes de l'hébergeur ne partent QUE dans l'email d'acceptation.
 */
export async function acceptRequest(
  db: Db,
  host: Actor,
  requestId: string,
  now = new Date(),
): Promise<void> {
  // Épinglage : la demande doit exister ET porter sur un logement du compte.
  // Sinon NOT_FOUND, sans distinction (ne pas révéler les demandes d'autrui, §9).
  const pin = await db.lodgingRequest.findFirst({
    where: { id: requestId, listing: { ownerId: host.id } },
    select: { requesterId: true, listingId: true },
  })
  if (!pin) throw new AppError('NOT_FOUND', 'Demande introuvable')

  const result = await withRequesterLock(db, pin.requesterId, async (tx) => {
    // CAS (règle 1) : PENDING non périmée, logement toujours au compte.
    const accepted = await tx.lodgingRequest.updateMany({
      where: {
        id: requestId,
        status: 'PENDING',
        lastActivityAt: { gte: expiryCutoff(now) },
        listing: { ownerId: host.id },
      },
      data: { status: 'ACCEPTED', respondedAt: now, lastActivityAt: now },
    })
    if (accepted.count === 0) {
      throw new AppError('CONFLICT', 'Demande expirée ou déjà traitée')
    }

    // Les AUTRES PENDING du demandeur — WHERE status PENDING (règle 5) : ne peut
    // jamais toucher une demande ACCEPTED, ni celles d'un autre demandeur.
    const siblings = await tx.lodgingRequest.findMany({
      where: { requesterId: pin.requesterId, status: 'PENDING', id: { not: requestId } },
      select: {
        id: true,
        listing: {
          select: {
            category: true,
            title: true,
            capacity: true,
            beds: { select: BED_TITLE_SELECT },
            owner: { select: RECIPIENT_SELECT },
          },
        },
      },
    })
    if (siblings.length > 0) {
      await tx.lodgingRequest.updateMany({
        where: { requesterId: pin.requesterId, status: 'PENDING', id: { not: requestId } },
        data: { status: 'CANCELLED', cancelledBy: 'SYSTEM' },
      })
    }

    // Répondre est une action d'hébergeur : anti-faux-positif du masquage automatique.
    await tx.listing.update({
      where: { id: pin.listingId },
      data: { lastHostActivityAt: now },
    })

    const accepted_ = await tx.lodgingRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        dateFrom: true,
        dateTo: true,
        requester: { select: RECIPIENT_SELECT },
        listing: {
          select: {
            addressFull: true,
            category: true,
            title: true,
            capacity: true,
            beds: { select: BED_TITLE_SELECT },
            owner: {
              select: { firstName: true, lastName: true, phone: true, email: true },
            },
          },
        },
      },
    })
    return { accepted: accepted_, siblings }
  })

  // APRÈS commit (règle 4).
  const appOrigin = getEnv().APP_ORIGIN
  const owner = result.accepted.listing.owner
  const acceptedEmail = await renderRequestAcceptedEmail({
    requesterFirstName: result.accepted.requester.firstName ?? '',
    hostFirstName: owner.firstName ?? '',
    hostLastName: owner.lastName ?? '',
    hostPhone: owner.phone ?? '',
    hostEmail: owner.email,
    addressFull: result.accepted.listing.addressFull,
    dateRange: formatDateRangeLong(
      isoDate(result.accepted.dateFrom),
      isoDate(result.accepted.dateTo),
    ),
    listingTitle: listingCardTitle(result.accepted.listing),
    actionUrl: `${appOrigin}/mes-demandes`,
  })
  sendToRecipientAsync(result.accepted.requester, {
    ...acceptedEmail,
    idempotencyKey: `accepted/${requestId}`,
  })

  for (const sibling of result.siblings) {
    const cancelledEmail = await renderRequestCancelledEmail({
      toFirstName: sibling.listing.owner.firstName,
      listingTitle: ownerTitle(sibling.listing),
      cancelledByLabel: 'automatiquement : le demandeur a été accepté ailleurs',
      actionUrl: `${appOrigin}/hebergeur/demandes`,
    })
    sendToRecipientAsync(sibling.listing.owner, {
      ...cancelledEmail,
      idempotencyKey: `cancelled/${sibling.id}`,
    })
  }
}

// ---------------------------------------------------------------------------
// Refus (POST /requests/:id/decline)
// ---------------------------------------------------------------------------

export async function declineRequest(
  db: Db,
  host: Actor,
  requestId: string,
  now = new Date(),
): Promise<void> {
  const pin = await db.lodgingRequest.findFirst({
    where: { id: requestId, listing: { ownerId: host.id } },
    select: { listingId: true },
  })
  if (!pin) throw new AppError('NOT_FOUND', 'Demande introuvable')

  const declined = await retryOnceOnP2034(() =>
    db.$transaction(async (tx) => {
      const cas = await tx.lodgingRequest.updateMany({
        where: {
          id: requestId,
          status: 'PENDING',
          lastActivityAt: { gte: expiryCutoff(now) },
          listing: { ownerId: host.id },
        },
        data: { status: 'DECLINED', respondedAt: now },
      })
      if (cas.count === 0) {
        throw new AppError('CONFLICT', 'Demande expirée ou déjà traitée')
      }
      await tx.listing.update({
        where: { id: pin.listingId },
        data: { lastHostActivityAt: now },
      })
      return tx.lodgingRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: {
          requester: { select: RECIPIENT_SELECT },
          listing: {
            select: {
              category: true,
              title: true,
              capacity: true,
              beds: { select: BED_TITLE_SELECT },
            },
          },
        },
      })
    }),
  )

  const rendered = await renderRequestDeclinedEmail({
    requesterFirstName: declined.requester.firstName ?? '',
    listingTitle: listingCardTitle(declined.listing),
    actionUrl: `${getEnv().APP_ORIGIN}/recherche`,
  })
  sendToRecipientAsync(declined.requester, {
    ...rendered,
    idempotencyKey: `declined/${requestId}`,
  })
}

// ---------------------------------------------------------------------------
// Annulation bilatérale (POST /requests/:id/cancel)
// ---------------------------------------------------------------------------

/**
 * Autorisée au demandeur ET à l'hébergeur, sur PENDING ou ACCEPTED (annulation
 * post-acceptation, maquette). Le statut OBSERVÉ à l'entrée est épinglé dans le
 * WHERE du CAS, et la transaction prend le verrou demandeur : la course
 * accept/cancel a un seul gagnant, l'autre reçoit 409 — jamais une acceptation
 * silencieusement écrasée.
 */
export async function cancelRequest(
  db: Db,
  user: Actor,
  requestId: string,
  now = new Date(),
): Promise<void> {
  const pin = await db.lodgingRequest.findFirst({
    where: {
      id: requestId,
      OR: [{ requesterId: user.id }, { listing: { ownerId: user.id } }],
    },
    select: { requesterId: true, listingId: true, status: true },
  })
  if (!pin) throw new AppError('NOT_FOUND', 'Demande introuvable')

  const role = pin.requesterId === user.id ? ('REQUESTER' as const) : ('HOST' as const)
  const pinnedStatus = pin.status
  if (pinnedStatus !== 'PENDING' && pinnedStatus !== 'ACCEPTED') {
    throw new AppError('CONFLICT', 'Demande expirée ou déjà traitée')
  }

  const cancelled = await withRequesterLock(db, pin.requesterId, async (tx) => {
    const cas = await tx.lodgingRequest.updateMany({
      where: {
        id: requestId,
        status: pinnedStatus,
        // Prédicat d'expiration à l'écriture (règle 1) — une PENDING périmée est morte,
        // pas annulable ; une ACCEPTED n'expire pas.
        ...(pinnedStatus === 'PENDING' ? { lastActivityAt: { gte: expiryCutoff(now) } } : {}),
        ...(role === 'REQUESTER' ? { requesterId: user.id } : { listing: { ownerId: user.id } }),
      },
      data: { status: 'CANCELLED', cancelledBy: role },
    })
    if (cas.count === 0) {
      throw new AppError('CONFLICT', 'Demande expirée ou déjà traitée')
    }
    if (role === 'HOST') {
      await tx.listing.update({
        where: { id: pin.listingId },
        data: { lastHostActivityAt: now },
      })
    }
    return tx.lodgingRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        requester: { select: RECIPIENT_SELECT },
        listing: {
          select: {
            category: true,
            title: true,
            capacity: true,
            beds: { select: BED_TITLE_SELECT },
            owner: { select: RECIPIENT_SELECT },
          },
        },
      },
    })
  })

  // Email à l'AUTRE côté (règle 4).
  const appOrigin = getEnv().APP_ORIGIN
  if (role === 'REQUESTER') {
    const rendered = await renderRequestCancelledEmail({
      toFirstName: cancelled.listing.owner.firstName,
      listingTitle: ownerTitle(cancelled.listing),
      cancelledByLabel: 'le demandeur',
      actionUrl: `${appOrigin}/hebergeur/demandes`,
    })
    sendToRecipientAsync(cancelled.listing.owner, {
      ...rendered,
      idempotencyKey: `cancelled/${requestId}`,
    })
  } else {
    const rendered = await renderRequestCancelledEmail({
      toFirstName: cancelled.requester.firstName,
      listingTitle: listingCardTitle(cancelled.listing),
      cancelledByLabel: "l'hébergeur",
      actionUrl: `${appOrigin}/mes-demandes`,
    })
    sendToRecipientAsync(cancelled.requester, {
      ...rendered,
      idempotencyKey: `cancelled/${requestId}`,
    })
  }
}

// ---------------------------------------------------------------------------
// Messages (POST /requests/:id/messages)
// ---------------------------------------------------------------------------

/**
 * Question de l'hébergeur ou réponse du demandeur — uniquement sur une PENDING
 * non périmée. Remet le délai de 7 jours à zéro et bascule awaitingSide vers
 * l'AUTRE côté (c'est à lui d'agir désormais).
 */
export async function addMessage(
  db: Db,
  user: Actor,
  requestId: string,
  body: string,
  now = new Date(),
): Promise<void> {
  const pin = await db.lodgingRequest.findFirst({
    where: {
      id: requestId,
      OR: [{ requesterId: user.id }, { listing: { ownerId: user.id } }],
    },
    select: { requesterId: true, listingId: true, listing: { select: { ownerId: true } } },
  })
  if (!pin) throw new AppError('NOT_FOUND', 'Demande introuvable')

  const isHost = pin.listing.ownerId === user.id
  const result = await retryOnceOnP2034(() =>
    db.$transaction(async (tx) => {
      const cas = await tx.lodgingRequest.updateMany({
        where: {
          id: requestId,
          status: 'PENDING',
          lastActivityAt: { gte: expiryCutoff(now) },
          ...(isHost ? { listing: { ownerId: user.id } } : { requesterId: user.id }),
        },
        data: { lastActivityAt: now, awaitingSide: isHost ? 'REQUESTER' : 'HOST' },
      })
      if (cas.count === 0) {
        throw new AppError('CONFLICT', 'Demande expirée ou déjà traitée')
      }
      const message = await tx.requestMessage.create({
        data: { requestId, senderId: user.id, body },
        select: { id: true },
      })
      if (isHost) {
        await tx.listing.update({
          where: { id: pin.listingId },
          data: { lastHostActivityAt: now },
        })
      }
      const request = await tx.lodgingRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: {
          requester: { select: { ...RECIPIENT_SELECT, lastName: true } },
          listing: {
            select: { owner: { select: { ...RECIPIENT_SELECT, lastName: true } } },
          },
        },
      })
      return { messageId: message.id, request }
    }),
  )

  const to = isHost ? result.request.requester : result.request.listing.owner
  const fromName = isHost
    ? (hostDisplayName(result.request.listing.owner) ?? "L'hébergeur")
    : `${result.request.requester.firstName ?? ''} ${result.request.requester.lastName ?? ''}`.trim()
  const rendered = await renderRequestMessageEmail({
    toFirstName: to.firstName ?? '',
    fromName,
    body,
    actionUrl: `${getEnv().APP_ORIGIN}${isHost ? '/mes-demandes' : '/hebergeur/demandes'}`,
  })
  sendToRecipientAsync(to, { ...rendered, idempotencyKey: `message/${result.messageId}` })
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

/**
 * Statut effectif : une PENDING logiquement périmée est présentée EXPIRED sans
 * attendre le passage du job quotidien (qui ne fait que matérialiser).
 */
export function effectiveStatusOf(
  request: { status: RequestStatus; lastActivityAt: Date },
  now = new Date(),
): RequestStatus {
  if (request.status === 'PENDING' && request.lastActivityAt < expiryCutoff(now)) {
    return 'EXPIRED'
  }
  return request.status
}

type MyRequestsResponse = z.infer<typeof MyRequestsResponseSchema>
type ReceivedRequestsResponse = z.infer<typeof ReceivedRequestsResponseSchema>

const THREAD_SELECT = {
  orderBy: { createdAt: 'asc' },
  select: { id: true, senderId: true, body: true, createdAt: true },
} as const

interface ThreadMessageRow {
  id: string
  senderId: string
  body: string
  createdAt: Date
}

interface CommonRow {
  id: string
  dateFrom: Date
  dateTo: Date
  peopleCount: number
  status: RequestStatus
  awaitingSide: 'HOST' | 'REQUESTER'
  lastActivityAt: Date
  createdAt: Date
  messages: ThreadMessageRow[]
}

/** Champs communs aux deux vues (contrat `requestCommon`). */
function commonFields(row: CommonRow, listingOwnerId: string, now: Date) {
  return {
    id: row.id,
    dateFrom: isoDate(row.dateFrom),
    dateTo: isoDate(row.dateTo),
    peopleCount: row.peopleCount,
    status: row.status,
    effectiveStatus: effectiveStatusOf(row, now),
    awaitingSide: row.awaitingSide,
    lastActivityAt: row.lastActivityAt.toISOString(),
    expiresAt: new Date(row.lastActivityAt.getTime() + REQUEST_EXPIRY_MS).toISOString(),
    createdAt: row.createdAt.toISOString(),
    messages: row.messages.map((message) => ({
      id: message.id,
      from: message.senderId === listingOwnerId ? ('HOST' as const) : ('REQUESTER' as const),
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    })),
  }
}

const MY_REQUEST_SELECT = {
  id: true,
  dateFrom: true,
  dateTo: true,
  peopleCount: true,
  status: true,
  awaitingSide: true,
  lastActivityAt: true,
  createdAt: true,
  messages: THREAD_SELECT,
  listing: {
    select: {
      id: true,
      ownerId: true,
      category: true,
      site: true,
      title: true,
      capacity: true,
      displayArea: true,
      // ⚠️ Chargée pour la SEULE variante ACCEPTED : le builder ci-dessous ne pose la clé
      // hostContact que sur elle, et la route re-parse l'union discriminée avant c.json (§5).
      addressFull: true,
      beds: { select: BED_TITLE_SELECT },
      owner: { select: { firstName: true, lastName: true, phone: true, email: true } },
    },
  },
} as const satisfies Prisma.LodgingRequestSelect

/**
 * Vue demandeur. Les CANCELLED n'apparaissent pas (arbitrage 12 : une demande
 * annulée sort des listes et libère le quota). hostContact UNIQUEMENT si
 * effectiveStatus ACCEPTED — jamais la clé sinon (union discriminée du contrat).
 */
export async function listMyRequests(
  db: Db,
  requesterId: string,
  now = new Date(),
): Promise<MyRequestsResponse> {
  const [rows, pendingCount] = await Promise.all([
    db.lodgingRequest.findMany({
      where: { requesterId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
      select: MY_REQUEST_SELECT,
    }),
    db.lodgingRequest.count({
      where: { requesterId, status: 'PENDING', lastActivityAt: { gte: expiryCutoff(now) } },
    }),
  ])

  const items = rows.map((row) => {
    const base = commonFields(row, row.listing.ownerId, now)
    const item = {
      ...base,
      listing: {
        id: row.listing.id,
        title: listingCardTitle(row.listing),
        displayArea: row.listing.displayArea,
        site: row.listing.site,
        category: row.listing.category,
      },
      hostDisplayName: hostDisplayName(row.listing.owner) ?? '',
    }
    if (base.effectiveStatus !== 'ACCEPTED') return item
    return {
      ...item,
      hostContact: {
        firstName: row.listing.owner.firstName ?? '',
        lastName: row.listing.owner.lastName ?? '',
        phone: row.listing.owner.phone ?? '',
        email: row.listing.owner.email,
        addressFull: row.listing.addressFull,
      },
    }
  })

  return MyRequestsResponseSchema.parse({
    items,
    pendingCount,
    pendingLimit: REQUEST_PENDING_LIMIT,
  })
}

const RECEIVED_REQUEST_SELECT = {
  id: true,
  dateFrom: true,
  dateTo: true,
  peopleCount: true,
  status: true,
  awaitingSide: true,
  lastActivityAt: true,
  createdAt: true,
  messages: THREAD_SELECT,
  requester: {
    select: { firstName: true, lastName: true, phone: true, accessibilityNeeds: true },
  },
  listing: {
    select: {
      id: true,
      ownerId: true,
      category: true,
      title: true,
      capacity: true,
      beds: { select: BED_TITLE_SELECT },
      owner: { select: { firstName: true } },
    },
  },
} as const satisfies Prisma.LodgingRequestSelect

/**
 * Vue hébergeur des demandes reçues : téléphone du demandeur transmis d'emblée
 * (« c'est à toi de la contacter »), besoins d'accessibilité, alerte sur-capacité.
 * CANCELLED exclues (arbitrage 12).
 */
export async function listReceivedRequests(
  db: Db,
  hostId: string,
  now = new Date(),
): Promise<ReceivedRequestsResponse> {
  const rows = await db.lodgingRequest.findMany({
    where: { listing: { ownerId: hostId }, status: { not: 'CANCELLED' } },
    orderBy: { createdAt: 'desc' },
    select: RECEIVED_REQUEST_SELECT,
  })

  const items = rows.map((row) => ({
    ...commonFields(row, row.listing.ownerId, now),
    listingId: row.listing.id,
    listingTitle: ownerTitle(row.listing),
    requester: {
      firstName: row.requester.firstName ?? '',
      lastName: row.requester.lastName ?? '',
      phone: row.requester.phone ?? '',
      needs: parseAccessibilityNeeds(row.requester.accessibilityNeeds),
    },
    overCapacity: row.peopleCount > row.listing.capacity,
  }))

  return ReceivedRequestsResponseSchema.parse({ items })
}

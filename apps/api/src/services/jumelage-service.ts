import type { JumelageAdUpsertSchema, JumelageKind } from '@repo/contracts'
import { type Db, Prisma } from '@repo/db'
import { renderJumelageAcceptedEmail, renderJumelageContactEmail } from '@repo/emails'
import { formatDateRangeShort } from '@repo/event-config'
import type { z } from 'zod'
import { getEnv } from '../env'
import { AppError } from '../errors'
import type { SessionUser } from './auth-service'
import { sendToRecipientAsync } from './notify'

/**
 * Jumelage entre unités scoutes (écrans A.13-A.16) — pure mise en relation, pas de
 * réservation. Règles maquette : ni refus ni expiration (« Ignorer » masque sans
 * notifier), multi-jumelage possible, la seule porte de sortie est le retrait de
 * l'annonce. À l'acceptation, chaque unité reçoit l'e-mail, le téléphone et le nom
 * du responsable de l'autre — et JAMAIS avant : les coordonnées n'apparaissent que
 * dans les branches ACCEPTED des DTO (minimisation §5).
 */

type JumelageAdUpsertInput = z.infer<typeof JumelageAdUpsertSchema>

// ---------------------------------------------------------------------------
// Selects explicites (§5 — jamais de findMany nu sur une table à PII)
// ---------------------------------------------------------------------------

/** Carte/fiche publique d'annonce : identité publique de l'unité, JAMAIS email ni téléphone. */
const AD_SELECT = {
  id: true,
  kind: true,
  site: true,
  dateFrom: true,
  dateTo: true,
  peopleLabel: true,
  description: true,
  status: true,
  createdAt: true,
  // userId sert aux contrôles d'accès (exclusion de sa propre annonce), ne sort jamais.
  userId: true,
  user: { select: { unitName: true, unitBranch: true } },
} as const satisfies Prisma.JumelageAdSelect

type AdRow = Prisma.JumelageAdGetPayload<{ select: typeof AD_SELECT }>

/** Coordonnées d'une partie d'une mise en relation ACCEPTED (révélation mutuelle). */
const RELATION_PARTY_SELECT = {
  unitName: true,
  unitBranch: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
} as const satisfies Prisma.UserSelect

/** Variante avec emailStatus, pour les envois (garde bounce/plainte de notify). */
const NOTIFY_PARTY_SELECT = {
  ...RELATION_PARTY_SELECT,
  emailStatus: true,
} as const satisfies Prisma.UserSelect

type RelationParty = Prisma.UserGetPayload<{ select: typeof RELATION_PARTY_SELECT }>

// ---------------------------------------------------------------------------
// Mapping DTO
// ---------------------------------------------------------------------------

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** « Nina Colin » — prénom + nom du responsable, révélés à l'acceptation seulement. */
function fullName(person: { firstName: string | null; lastName: string | null }): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ')
}

/** Liste EXHAUSTIVE des champs publics d'une annonce (JumelageAdSchema). */
function toAd(row: AdRow) {
  return {
    id: row.id,
    kind: row.kind,
    site: row.site,
    dateFrom: isoDate(row.dateFrom),
    dateTo: isoDate(row.dateTo),
    peopleLabel: row.peopleLabel,
    description: row.description,
    unitName: row.user.unitName ?? '',
    unitBranch: row.user.unitBranch,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Vue propriétaire (MyJumelageAdSchema) : la carte publique + le statut. */
function toMyAd(row: AdRow) {
  return { ...toAd(row), status: row.status }
}

// ---------------------------------------------------------------------------
// Annonce — une seule ACTIVE par unité (index partiel JumelageAd_one_active)
// ---------------------------------------------------------------------------

function assertDateRange(input: JumelageAdUpsertInput): void {
  if (input.dateFrom >= input.dateTo) {
    throw new AppError('VALIDATION_ERROR', 'La date de début doit précéder la date de fin')
  }
}

function adData(input: JumelageAdUpsertInput) {
  return {
    kind: input.kind,
    site: input.site,
    dateFrom: new Date(input.dateFrom),
    dateTo: new Date(input.dateTo),
    peopleLabel: input.peopleLabel,
    description: input.description ?? null,
  }
}

/**
 * Créer ou mettre à jour L'annonce (unique) de l'unité : si une ACTIVE existe elle
 * est modifiée, sinon on en crée une. L'index unique partiel `JumelageAd_one_active`
 * est le filet contre la course de deux créations simultanées : P2002 → on relit
 * l'ACTIVE gagnante et on la met à jour.
 */
export async function upsertMyAd(db: Db, user: SessionUser, input: JumelageAdUpsertInput) {
  assertDateRange(input)
  const data = adData(input)

  const active = await db.jumelageAd.findFirst({
    where: { userId: user.id, status: 'ACTIVE' },
    select: { id: true },
  })

  let adId: string
  if (active) {
    await db.jumelageAd.update({ where: { id: active.id }, data })
    adId = active.id
  } else {
    try {
      const created = await db.jumelageAd.create({
        data: { userId: user.id, ...data },
        select: { id: true },
      })
      adId = created.id
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await db.jumelageAd.findFirst({
          where: { userId: user.id, status: 'ACTIVE' },
          select: { id: true },
        })
        if (!winner) throw error
        await db.jumelageAd.update({ where: { id: winner.id }, data })
        adId = winner.id
      } else {
        throw error
      }
    }
  }

  const row = await db.jumelageAd.findUniqueOrThrow({ where: { id: adId }, select: AD_SELECT })
  return toMyAd(row)
}

/**
 * « Retirer notre annonce » — la seule porte de sortie du jumelage (maquette).
 * CAS updateMany : pas de SELECT-puis-UPDATE (règle d'intégrité 1).
 */
export async function withdrawMyAd(db: Db, user: SessionUser): Promise<void> {
  const updated = await db.jumelageAd.updateMany({
    where: { userId: user.id, status: 'ACTIVE' },
    data: { status: 'WITHDRAWN' },
  })
  if (updated.count === 0) {
    throw new AppError('NOT_FOUND', 'Aucune annonce active à retirer')
  }
}

/**
 * Liste publique des annonces ACTIVE — la propre annonce du viewer est exclue
 * (« la recherche marche dans les deux sens », on ne se voit pas soi-même).
 */
export async function listAds(
  db: Db,
  viewer: SessionUser,
  filters: { site?: string; kind?: JumelageKind },
) {
  const rows = await db.jumelageAd.findMany({
    where: {
      status: 'ACTIVE',
      userId: { not: viewer.id },
      ...(filters.site ? { site: filters.site } : {}),
      ...(filters.kind ? { kind: filters.kind } : {}),
    },
    select: AD_SELECT,
    orderBy: { createdAt: 'desc' },
  })
  const items = rows.map(toAd)
  return { items, total: items.length }
}

/** Fiche annonce : ACTIVE pour tout le monde ; une annonce retirée reste visible par son unité. */
export async function getAd(db: Db, viewer: SessionUser, adId: string) {
  const row = await db.jumelageAd.findFirst({ where: { id: adId }, select: AD_SELECT })
  if (!row || (row.status !== 'ACTIVE' && row.userId !== viewer.id)) {
    throw new AppError('NOT_FOUND', 'Annonce introuvable')
  }
  return toAd(row)
}

// ---------------------------------------------------------------------------
// Contacts — PENDING → ACCEPTED (ou ignoré en silence), jamais de refus
// ---------------------------------------------------------------------------

/**
 * « Demander à être mis en relation » (A.15). Anti-doublon par @@unique(adId,
 * requesterId) → P2002 mappé en 409. L'email au propriétaire part APRÈS l'écriture
 * (jamais dans une transaction, règle d'intégrité 4), avec le peopleLabel de la
 * propre annonce ACTIVE du demandeur s'il en a une.
 */
export async function createContact(
  db: Db,
  requester: SessionUser,
  adId: string,
  message: string | null,
): Promise<void> {
  const ad = await db.jumelageAd.findFirst({
    where: { id: adId },
    select: {
      id: true,
      status: true,
      userId: true,
      user: { select: { unitName: true, email: true, emailStatus: true } },
    },
  })
  if (ad?.status !== 'ACTIVE') {
    throw new AppError('NOT_FOUND', 'Annonce introuvable')
  }
  if (ad.userId === requester.id) {
    throw new AppError('VALIDATION_ERROR', 'Impossible de répondre à sa propre annonce')
  }

  let contactId: string
  try {
    const created = await db.jumelageContact.create({
      data: { adId: ad.id, requesterId: requester.id, message },
      select: { id: true },
    })
    contactId = created.id
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('CONFLICT', 'Demande déjà envoyée')
    }
    throw error
  }

  const myAd = await db.jumelageAd.findFirst({
    where: { userId: requester.id, status: 'ACTIVE' },
    select: { peopleLabel: true },
  })
  const rendered = await renderJumelageContactEmail({
    toUnitName: ad.user.unitName ?? '',
    fromUnitName: requester.unitName ?? '',
    fromBranch: requester.unitBranch ?? '',
    peopleLabel: myAd?.peopleLabel ?? '—',
    message,
    actionUrl: `${getEnv().APP_ORIGIN}/unite/relations`,
  })
  sendToRecipientAsync(ad.user, { ...rendered, idempotencyKey: `jumelage-contact/${contactId}` })
}

/**
 * « Accepter et échanger nos contacts » (A.16) — réservé au propriétaire de
 * l'annonce. Transition en CAS ; à l'acceptation, CHACUNE des deux unités reçoit
 * les coordonnées (nom du responsable, e-mail, téléphone) de l'autre. Pas
 * d'expiration ni de refus : un PENDING reste acceptable indéfiniment.
 */
export async function acceptContact(
  db: Db,
  owner: SessionUser,
  contactId: string,
  now = new Date(),
): Promise<void> {
  const updated = await db.jumelageContact.updateMany({
    where: { id: contactId, status: 'PENDING', ad: { userId: owner.id } },
    data: { status: 'ACCEPTED', acceptedAt: now },
  })
  if (updated.count === 0) {
    // Distinction : une demande déjà acceptée (double clic) est un conflit ; une
    // demande inconnue ou appartenant à autrui n'existe pas (pas de fuite, §9).
    const existing = await db.jumelageContact.findFirst({
      where: { id: contactId, ad: { userId: owner.id } },
      select: { status: true },
    })
    if (existing?.status === 'ACCEPTED') {
      throw new AppError('CONFLICT', 'Demande déjà acceptée')
    }
    throw new AppError('NOT_FOUND', 'Demande introuvable')
  }

  // Le jumelage étant multi, l'annonce de chaque unité reste ACTIVE après
  // l'acceptation : l'email propose de la retirer (seule porte de sortie) —
  // bouton présent uniquement si l'unité a effectivement une annonce ACTIVE.
  const activeAd = { where: { status: 'ACTIVE' }, take: 1, select: { id: true } } as const
  const contact = await db.jumelageContact.findUniqueOrThrow({
    where: { id: contactId },
    select: {
      requester: { select: { ...NOTIFY_PARTY_SELECT, jumelageAds: activeAd } },
      ad: { select: { user: { select: { ...NOTIFY_PARTY_SELECT, jumelageAds: activeAd } } } },
    },
  })
  const ownerParty = contact.ad.user
  const requesterParty = contact.requester
  const withdrawUrl = `${getEnv().APP_ORIGIN}/unite/relations`

  // Au propriétaire : les coordonnées du demandeur.
  const toOwner = await renderJumelageAcceptedEmail({
    toUnitName: ownerParty.unitName ?? '',
    otherUnitName: requesterParty.unitName ?? '',
    contactName: fullName(requesterParty),
    contactEmail: requesterParty.email,
    contactPhone: requesterParty.phone ?? '',
    withdrawUrl: ownerParty.jumelageAds.length > 0 ? withdrawUrl : null,
  })
  sendToRecipientAsync(ownerParty, { ...toOwner, idempotencyKey: `jumelage-accepted/${contactId}` })

  // Au demandeur : les coordonnées du propriétaire.
  const toRequester = await renderJumelageAcceptedEmail({
    toUnitName: requesterParty.unitName ?? '',
    otherUnitName: ownerParty.unitName ?? '',
    contactName: fullName(ownerParty),
    contactEmail: ownerParty.email,
    contactPhone: ownerParty.phone ?? '',
    withdrawUrl: requesterParty.jumelageAds.length > 0 ? withdrawUrl : null,
  })
  sendToRecipientAsync(requesterParty, {
    ...toRequester,
    idempotencyKey: `jumelage-accepted-b/${contactId}`,
  })
}

/**
 * « Ignorer » (A.16) : masque la demande de l'onglet Reçues, sans la refuser et
 * SANS AUCUNE notification — le demandeur continue de la voir « sans suite ».
 * Idempotent : ré-ignorer une demande encore PENDING repose simplement dismissedAt.
 */
export async function dismissContact(
  db: Db,
  owner: SessionUser,
  contactId: string,
  now = new Date(),
): Promise<void> {
  const updated = await db.jumelageContact.updateMany({
    where: { id: contactId, status: 'PENDING', ad: { userId: owner.id } },
    data: { dismissedAt: now },
  })
  if (updated.count === 0) {
    throw new AppError('NOT_FOUND', 'Demande introuvable')
  }
}

// ---------------------------------------------------------------------------
// Vue « Demandes de mise en relation » (A.16) — onglets Reçues / En relation
// ---------------------------------------------------------------------------

function toRelation(id: string, acceptedAt: Date, party: RelationParty) {
  return {
    id,
    unitName: party.unitName ?? '',
    unitBranch: party.unitBranch,
    contactName: fullName(party),
    email: party.email,
    phone: party.phone ?? '',
    acceptedAt: acceptedAt.toISOString(),
  }
}

/**
 * Tout l'espace jumelage du compte : son annonce ACTIVE (null si retirée), les
 * demandes reçues (PENDING non ignorées + ACCEPTED — les coordonnées du demandeur
 * n'apparaissent QUE sur les ACCEPTED), les mises en relation des DEUX sens, et
 * ses demandes envoyées encore sans réponse (un « Ignorer » en face étant
 * silencieux, elles restent listées telles quelles).
 */
export async function getMyJumelage(db: Db, user: SessionUser) {
  const [adRow, receivedRows, acceptedSent, acceptedReceived, sentPendingRows] = await Promise.all([
    db.jumelageAd.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      select: AD_SELECT,
    }),
    db.jumelageContact.findMany({
      where: {
        ad: { userId: user.id },
        OR: [{ status: 'ACCEPTED' }, { status: 'PENDING', dismissedAt: null }],
      },
      select: {
        id: true,
        status: true,
        message: true,
        createdAt: true,
        acceptedAt: true,
        requester: {
          select: {
            ...RELATION_PARTY_SELECT,
            // Sa propre annonce ACTIVE fournit le « 16 personnes, 24 au 29 sept. » de la carte
            jumelageAds: {
              where: { status: 'ACTIVE' },
              take: 1,
              select: { peopleLabel: true, dateFrom: true, dateTo: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.jumelageContact.findMany({
      where: { requesterId: user.id, status: 'ACCEPTED' },
      select: {
        id: true,
        acceptedAt: true,
        createdAt: true,
        ad: { select: { user: { select: RELATION_PARTY_SELECT } } },
      },
    }),
    db.jumelageContact.findMany({
      where: { ad: { userId: user.id }, status: 'ACCEPTED' },
      select: {
        id: true,
        acceptedAt: true,
        createdAt: true,
        requester: { select: RELATION_PARTY_SELECT },
      },
    }),
    db.jumelageContact.findMany({
      where: { requesterId: user.id, status: 'PENDING' },
      select: {
        id: true,
        adId: true,
        createdAt: true,
        ad: { select: { user: { select: { unitName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const received = receivedRows.map((row) => {
    const requesterAd = row.requester.jumelageAds[0]
    const base = {
      id: row.id,
      unitName: row.requester.unitName ?? '',
      unitBranch: row.requester.unitBranch,
      peopleLabel: requesterAd?.peopleLabel ?? null,
      dates: requesterAd
        ? formatDateRangeShort(isoDate(requesterAd.dateFrom), isoDate(requesterAd.dateTo))
        : null,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
    }
    if (row.status === 'ACCEPTED') {
      return {
        ...base,
        status: 'ACCEPTED' as const,
        contact: {
          name: fullName(row.requester),
          email: row.requester.email,
          phone: row.requester.phone ?? '',
        },
      }
    }
    // PENDING : AUCUNE coordonnée — ni email, ni téléphone, ni nom du responsable.
    return { ...base, status: 'PENDING' as const }
  })

  const relations = [
    ...acceptedSent.map((row) => toRelation(row.id, row.acceptedAt ?? row.createdAt, row.ad.user)),
    ...acceptedReceived.map((row) =>
      toRelation(row.id, row.acceptedAt ?? row.createdAt, row.requester),
    ),
  ].sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt))

  const sentPending = sentPendingRows.map((row) => ({
    id: row.id,
    adId: row.adId,
    unitName: row.ad.user.unitName ?? '',
    createdAt: row.createdAt.toISOString(),
  }))

  return {
    ad: adRow ? toMyAd(adRow) : null,
    received,
    relations,
    sentPending,
  }
}

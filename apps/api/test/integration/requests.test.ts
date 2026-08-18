/**
 * LA suite du cœur du produit : cycle de vie des demandes d'hébergement + job
 * quotidien. Un seul conteneur Postgres pour toute la suite ; les demandes et
 * messages sont remis à zéro entre chaque test, les comptes et logements de
 * fixtures persistent. Les seuils temporels (7 j, 24 h) se testent avec un `now`
 * réel en falsifiant `lastActivityAt` / `lastHostActivityAt` en base.
 *
 * Connexions : sessions créées en direct (createSession), pas de magic link —
 * donc pas besoin de vider magicLinkToken pour le throttle d'émission en base.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { runDailyJob } from '../../src/jobs/daily'
import { requestIpLimiter } from '../../src/routes/requests'
import { createSession } from '../../src/services/auth-service'
import { startTestEnv, type TestEnv } from '../helpers/testenv'

const DAY_MS = 24 * 60 * 60 * 1000
const JOB_SECRET = 'test-job-secret-0123456789'

let t: TestEnv

interface Fixture {
  id: string
  cookie: string
  email: string
}

let marie: Fixture // demandeuse principale (besoin « pmr »)
let pierre: Fixture // second demandeur
let claire: Fixture // hébergeuse de listing1
let karim: Fixture // hébergeur de listing2
let lea: Fixture // hébergeuse de listing3
let noe: Fixture // hébergeur de listing4 + institutionnels
let unite: Fixture // compte SCOUT_UNIT (cloisonnement)
let listing1: string
let listing2: string
let listing3: string
let listing4: string
let hotelListing: string
let scoutBaseAvecLien: string // SCOUT_BASE avec bookingUrl → comportement hôtel
let scoutBaseSansLien: string // SCOUT_BASE sans bookingUrl → flux standard

const DEFAULT_ADDRESS = '12 rue des Boulets, 75012 Paris'

async function mkIndividual(
  firstName: string,
  lastName: string,
  email: string,
  phone: string,
  needs?: string[],
): Promise<Fixture> {
  const user = await t.db.user.create({
    data: {
      accountType: 'INDIVIDUAL',
      firstName,
      lastName,
      email,
      phone,
      accessibilityNeeds: needs?.length ? JSON.stringify(needs) : null,
      onboardedAt: new Date(),
    },
    select: { id: true },
  })
  const raw = await createSession(t.db, user.id)
  return { id: user.id, cookie: `heberge_session=${raw}`, email }
}

interface ListingOverrides {
  status?: 'OPEN' | 'FULL'
  hiddenAt?: Date
  lastHostActivityAt?: Date
}

async function mkListing(ownerId: string, overrides: ListingOverrides = {}): Promise<string> {
  const listing = await t.db.listing.create({
    data: {
      ownerId,
      category: 'PRIVATE',
      site: 'paris',
      addressFull: DEFAULT_ADDRESS,
      displayArea: 'Paris 12e',
      availableFrom: new Date('2026-09-20'),
      availableTo: new Date('2026-10-02'),
      capacity: 4,
      beds: { create: [{ type: 'PRIVATE_ROOM', count: 2, capacityEach: 2 }] },
      ...overrides,
    },
    select: { id: true },
  })
  return listing.id
}

async function postJson(path: string, cookie: string, body?: unknown): Promise<Response> {
  return t.app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

interface CreateOverrides {
  dateFrom?: string
  dateTo?: string
  peopleCount?: number
  message?: string
}

async function createReq(
  cookie: string,
  listingId: string,
  overrides: CreateOverrides = {},
): Promise<Response> {
  return postJson(`/api/listings/${listingId}/requests`, cookie, {
    dateFrom: '2026-09-25',
    dateTo: '2026-09-27',
    peopleCount: 3,
    message: 'Bonjour, nous cherchons un toit pour le week-end.',
    ...overrides,
  })
}

async function getJson<T>(path: string, cookie: string): Promise<T> {
  const res = await t.app.request(path, { headers: { cookie } })
  expect(res.status).toBe(200)
  return (await res.json()) as T
}

/** Id de la demande (créée en dernier) d'un couple logement × demandeur. */
async function reqIdOf(listingId: string, requesterId: string): Promise<string> {
  const row = await t.db.lodgingRequest.findFirstOrThrow({
    where: { listingId, requesterId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return row.id
}

async function requestRow(id: string) {
  return t.db.lodgingRequest.findUniqueOrThrow({
    where: { id },
    select: {
      status: true,
      cancelledBy: true,
      awaitingSide: true,
      lastActivityAt: true,
      lastReminderAt: true,
    },
  })
}

async function expectOutbox(count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(t.outbox.length).toBe(count)
  })
}

interface ErrorBody {
  error: { code: string; message: string }
}

interface MyRequestsBody {
  items: Array<{
    id: string
    status: string
    effectiveStatus: string
    awaitingSide: string
    expiresAt: string
    messages: Array<{ from: string; body: string }>
    listing: { id: string; title: string; displayArea: string; site: string; category: string }
    hostDisplayName: string
    hostContact?: {
      firstName: string
      lastName: string
      phone: string
      email: string
      addressFull: string
    }
  }>
  pendingCount: number
  pendingLimit: number
}

interface ReceivedBody {
  items: Array<{
    id: string
    status: string
    effectiveStatus: string
    overCapacity: boolean
    listingTitle: string
    messages: Array<{ from: string; body: string }>
    requester: { firstName: string; lastName: string; phone: string; needs: string[] }
  }>
}

beforeAll(async () => {
  // AVANT startTestEnv : resetEnvCache() y relit process.env, JOB_SECRET compris.
  process.env.JOB_SECRET = JOB_SECRET
  t = await startTestEnv()

  // Le harnais fait `prisma db push`, qui ne rejoue pas le SQL brut de la migration :
  // on recrée ici l'index unique partiel anti-doublon (DDL pur sur des colonnes non
  // chiffrées — hors du périmètre de l'interdit $queryRaw sur les champs chiffrés).
  await t.db.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "LodgingRequest_active_uniq" ' +
      'ON "LodgingRequest"("listingId", "requesterId") ' +
      "WHERE status IN ('PENDING', 'ACCEPTED')",
  )

  marie = await mkIndividual('Marie', 'Lefèvre', 'marie@example.org', '+33612345601', ['pmr'])
  pierre = await mkIndividual('Pierre', 'Durand', 'pierre@example.org', '+33612345602')
  claire = await mkIndividual('Claire', 'Martin', 'claire@example.org', '+33612345603')
  karim = await mkIndividual('Karim', 'Benali', 'karim@example.org', '+33612345604')
  lea = await mkIndividual('Léa', 'Rousseau', 'lea@example.org', '+33612345605')
  noe = await mkIndividual('Noé', 'Fabre', 'noe@example.org', '+33612345606')

  const unitUser = await t.db.user.create({
    data: {
      accountType: 'SCOUT_UNIT',
      unitName: '1re Nancy',
      unitBranch: 'Pionniers-Caravelles',
      firstName: 'Nina',
      lastName: 'Colin',
      email: 'unite@example.org',
      phone: '+33612345607',
      onboardedAt: new Date(),
    },
    select: { id: true },
  })
  unite = {
    id: unitUser.id,
    cookie: `heberge_session=${await createSession(t.db, unitUser.id)}`,
    email: 'unite@example.org',
  }

  listing1 = await mkListing(claire.id)
  listing2 = await mkListing(karim.id)
  listing3 = await mkListing(lea.id)
  listing4 = await mkListing(noe.id)
  const hotel = await t.db.listing.create({
    data: {
      ownerId: noe.id,
      category: 'HOTEL',
      site: 'paris',
      title: 'Hôtel Ibis Nation',
      addressFull: '1 avenue de la Nation, 75012 Paris',
      displayArea: 'Paris 12e',
      availableFrom: new Date('2026-09-20'),
      availableTo: new Date('2026-10-02'),
      capacity: 50,
      bookingUrl: 'https://hotel.example.org',
    },
    select: { id: true },
  })
  hotelListing = hotel.id
  const baseAvecLien = await t.db.listing.create({
    data: {
      ownerId: noe.id,
      category: 'SCOUT_BASE',
      site: 'paris',
      title: 'Base scoute de Vincennes',
      addressFull: '2 route de la Pyramide, 75012 Paris',
      displayArea: 'Paris 12e',
      availableFrom: new Date('2026-09-20'),
      availableTo: new Date('2026-10-02'),
      capacity: 60,
      bookingUrl: 'https://base.example.org/reservation',
    },
    select: { id: true },
  })
  scoutBaseAvecLien = baseAvecLien.id
  const baseSansLien = await t.db.listing.create({
    data: {
      ownerId: noe.id,
      category: 'SCOUT_BASE',
      site: 'paris',
      title: 'Base scoute du Bois',
      addressFull: '4 route de la Pyramide, 75012 Paris',
      displayArea: 'Paris 12e',
      availableFrom: new Date('2026-09-20'),
      availableTo: new Date('2026-10-02'),
      capacity: 40,
    },
    select: { id: true },
  })
  scoutBaseSansLien = baseSansLien.id
})

beforeEach(async () => {
  requestIpLimiter.reset()
  await t.db.requestMessage.deleteMany({})
  await t.db.lodgingRequest.deleteMany({})
  t.outbox.length = 0
})

afterAll(async () => {
  await t.stop()
})

describe('création de demande', () => {
  it("201 : demande PENDING + message initial en fil + email à l'hébergeur avec le téléphone", async () => {
    const res = await createReq(marie.cookie, listing1)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true })

    const request = await t.db.lodgingRequest.findFirstOrThrow({
      where: { listingId: listing1, requesterId: marie.id },
      select: {
        id: true,
        status: true,
        awaitingSide: true,
        peopleCount: true,
        messages: { select: { senderId: true, body: true } },
      },
    })
    expect(request.status).toBe('PENDING')
    expect(request.awaitingSide).toBe('HOST')
    expect(request.peopleCount).toBe(3)
    expect(request.messages).toHaveLength(1)
    expect(request.messages[0]).toMatchObject({
      senderId: marie.id,
      body: 'Bonjour, nous cherchons un toit pour le week-end.',
    })

    await expectOutbox(1)
    const email = t.outbox[0]
    expect(email?.to).toBe(claire.email)
    expect(email?.text).toContain('+33612345601') // le téléphone du demandeur, transmis d'emblée
    expect(email?.text).toContain('Bonjour, nous cherchons un toit')
    expect(email?.idempotencyKey).toBe(`received/${request.id}`)
  })

  it("filet de sécurité : créer une demande active l'espace volontaire (seekerOnboardedAt)", async () => {
    await t.db.user.update({ where: { id: marie.id }, data: { seekerOnboardedAt: null } })
    const res = await createReq(marie.cookie, listing1)
    expect(res.status).toBe(201)
    const user = await t.db.user.findUniqueOrThrow({
      where: { id: marie.id },
      select: { seekerOnboardedAt: true },
    })
    expect(user.seekerOnboardedAt).not.toBeNull()
  })
})

describe('quota de sollicitations', () => {
  it('3 PENDING maximum : la 4e reçoit 409', async () => {
    for (const listingId of [listing1, listing2, listing3]) {
      expect((await createReq(marie.cookie, listingId)).status).toBe(201)
    }
    const res = await createReq(marie.cookie, listing4)
    expect(res.status).toBe(409)
    const body = (await res.json()) as ErrorBody
    expect(body.error.code).toBe('CONFLICT')
    expect(body.error.message).toContain('3 sollicitations en attente')
    await expectOutbox(3)
  })

  it('créations CONCURRENTES sur le dernier slot : exactement une passe (verrou advisory)', async () => {
    expect((await createReq(marie.cookie, listing1)).status).toBe(201)
    expect((await createReq(marie.cookie, listing2)).status).toBe(201)

    const [a, b] = await Promise.all([
      createReq(marie.cookie, listing3),
      createReq(marie.cookie, listing4),
    ])
    expect([a.status, b.status].sort()).toEqual([201, 409])

    const pending = await t.db.lodgingRequest.count({
      where: { requesterId: marie.id, status: 'PENDING' },
    })
    expect(pending).toBe(3)
    await expectOutbox(3)
  })
})

describe('anti-doublon par logement', () => {
  it('demande active sur le même logement → 409 ; re-demande possible après refus', async () => {
    expect((await createReq(marie.cookie, listing1)).status).toBe(201)

    const dup = await createReq(marie.cookie, listing1)
    expect(dup.status).toBe(409)
    expect(((await dup.json()) as ErrorBody).error.message).toContain('déjà en cours')

    // Le filet DB existe aussi : l'index partiel refuse une insertion directe.
    await expect(
      t.db.lodgingRequest.create({
        data: {
          listingId: listing1,
          requesterId: marie.id,
          dateFrom: new Date('2026-09-25'),
          dateTo: new Date('2026-09-27'),
          peopleCount: 2,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })

    const id = await reqIdOf(listing1, marie.id)
    expect((await postJson(`/api/requests/${id}/decline`, claire.cookie)).status).toBe(200)

    expect((await createReq(marie.cookie, listing1)).status).toBe(201)
    await expectOutbox(3) // received + declined + received
  })
})

describe('acceptation', () => {
  it("révèle les coordonnées, annule les autres PENDING du demandeur, épargne l'ACCEPTED d'autrui", async () => {
    // pierre a une demande ACCEPTED (autre demandeur : elle ne doit JAMAIS bouger)
    expect((await createReq(pierre.cookie, listing4)).status).toBe(201)
    const pierreRequest = await reqIdOf(listing4, pierre.id)
    expect((await postJson(`/api/requests/${pierreRequest}/accept`, noe.cookie)).status).toBe(200)

    // marie : 3 PENDING chez claire, karim, léa
    for (const listingId of [listing1, listing2, listing3]) {
      expect((await createReq(marie.cookie, listingId)).status).toBe(201)
    }
    const marieChezClaire = await reqIdOf(listing1, marie.id)
    await expectOutbox(5) // 2 (pierre : received + accepted) + 3 received
    t.outbox.length = 0

    expect((await postJson(`/api/requests/${marieChezClaire}/accept`, claire.cookie)).status).toBe(
      200,
    )

    expect((await requestRow(marieChezClaire)).status).toBe('ACCEPTED')
    const cancelled = await t.db.lodgingRequest.findMany({
      where: { requesterId: marie.id, status: 'CANCELLED' },
      select: { cancelledBy: true, listingId: true },
    })
    expect(cancelled).toHaveLength(2)
    expect(cancelled.every((row) => row.cancelledBy === 'SYSTEM')).toBe(true)
    expect(new Set(cancelled.map((row) => row.listingId))).toEqual(new Set([listing2, listing3]))
    // l'ACCEPTED d'un AUTRE demandeur n'est jamais touchée
    expect((await requestRow(pierreRequest)).status).toBe('ACCEPTED')

    // 3 emails : acceptation (marie) + annulation automatique (karim, léa)
    await expectOutbox(3)
    const acceptedEmail = t.outbox.find((email) => email.to === marie.email)
    expect(acceptedEmail?.text).toContain('+33612345603') // téléphone de claire
    expect(acceptedEmail?.text).toContain(claire.email)
    expect(acceptedEmail?.text).toContain(DEFAULT_ADDRESS) // adresse complète, enfin révélée
    expect(acceptedEmail?.idempotencyKey).toBe(`accepted/${marieChezClaire}`)
    const cancelledTos = t.outbox.filter((email) => email !== acceptedEmail).map((e) => e.to)
    expect(new Set(cancelledTos)).toEqual(new Set([karim.email, lea.email]))
    expect(
      t.outbox
        .filter((email) => email !== acceptedEmail)
        .every((email) => email.text.includes('accepté ailleurs')),
    ).toBe(true)

    // GET /my/requests : hostContact SEULEMENT sur l'acceptée ; les annulées absentes
    const my = await getJson<MyRequestsBody>('/api/my/requests', marie.cookie)
    expect(my.items).toHaveLength(1) // arbitrage 12 : les CANCELLED sortent des listes
    expect(my.items[0]?.effectiveStatus).toBe('ACCEPTED')
    expect(my.items[0]?.hostContact).toMatchObject({
      firstName: 'Claire',
      lastName: 'Martin',
      phone: '+33612345603',
      email: claire.email,
      addressFull: DEFAULT_ADDRESS,
    })
    expect(my.pendingCount).toBe(0)
    expect(my.pendingLimit).toBe(3)

    // GET /my/listings côté hébergeur : remplissage = Σ peopleCount des acceptées
    const mine = await getJson<{ items: Array<{ id: string; acceptedPeople: number }> }>(
      '/api/my/listings',
      claire.cookie,
    )
    expect(mine.items.find((item) => item.id === listing1)?.acceptedPeople).toBe(3)
  })

  it('accept vs cancel concurrents : un seul gagnant, l’autre 409, jamais d’état mixte', async () => {
    expect((await createReq(marie.cookie, listing1)).status).toBe(201)
    const id = await reqIdOf(listing1, marie.id)
    await expectOutbox(1)
    t.outbox.length = 0

    const [acceptRes, cancelRes] = await Promise.all([
      postJson(`/api/requests/${id}/accept`, claire.cookie),
      postJson(`/api/requests/${id}/cancel`, marie.cookie),
    ])
    expect([acceptRes.status, cancelRes.status].sort()).toEqual([200, 409])

    const final = await requestRow(id)
    if (acceptRes.status === 200) {
      expect(final.status).toBe('ACCEPTED')
      expect(final.cancelledBy).toBeNull()
    } else {
      expect(final.status).toBe('CANCELLED')
      expect(final.cancelledBy).toBe('REQUESTER')
    }
    await expectOutbox(1) // seul le gagnant notifie
  })
})

describe('refus', () => {
  it('DECLINED : plus en attente côté hébergeur, visible DECLINED côté demandeur, email envoyé', async () => {
    expect((await createReq(marie.cookie, listing1)).status).toBe(201)
    const id = await reqIdOf(listing1, marie.id)
    await expectOutbox(1)
    t.outbox.length = 0

    // un autre hébergeur ne peut pas refuser à sa place
    expect((await postJson(`/api/requests/${id}/decline`, karim.cookie)).status).toBe(404)

    expect((await postJson(`/api/requests/${id}/decline`, claire.cookie)).status).toBe(200)
    expect((await requestRow(id)).status).toBe('DECLINED')

    const received = await getJson<ReceivedBody>('/api/my/received-requests', claire.cookie)
    const item = received.items.find((row) => row.id === id)
    expect(item?.effectiveStatus).toBe('DECLINED')
    expect(received.items.filter((row) => row.effectiveStatus === 'PENDING')).toHaveLength(0)

    const my = await getJson<MyRequestsBody>('/api/my/requests', marie.cookie)
    expect(my.items.find((row) => row.id === id)?.effectiveStatus).toBe('DECLINED')
    expect(my.pendingCount).toBe(0) // le refus libère le quota

    await expectOutbox(1)
    expect(t.outbox[0]?.to).toBe(marie.email)
    expect(t.outbox[0]?.idempotencyKey).toBe(`declined/${id}`)
  })
})

describe('annulation bilatérale', () => {
  it("le demandeur annule une PENDING → email à l'hébergeur", async () => {
    expect((await createReq(marie.cookie, listing1)).status).toBe(201)
    const id = await reqIdOf(listing1, marie.id)
    await expectOutbox(1)
    t.outbox.length = 0

    expect((await postJson(`/api/requests/${id}/cancel`, marie.cookie)).status).toBe(200)
    expect(await requestRow(id)).toMatchObject({ status: 'CANCELLED', cancelledBy: 'REQUESTER' })

    await expectOutbox(1)
    expect(t.outbox[0]?.to).toBe(claire.email)
    expect(t.outbox[0]?.text).toContain('le demandeur')
  })

  it("l'hébergeur annule une ACCEPTED (post-acceptation, maquette) → email au demandeur", async () => {
    expect((await createReq(marie.cookie, listing2)).status).toBe(201)
    const id = await reqIdOf(listing2, marie.id)
    expect((await postJson(`/api/requests/${id}/accept`, karim.cookie)).status).toBe(200)
    await expectOutbox(2)
    t.outbox.length = 0

    expect((await postJson(`/api/requests/${id}/cancel`, karim.cookie)).status).toBe(200)
    expect(await requestRow(id)).toMatchObject({ status: 'CANCELLED', cancelledBy: 'HOST' })

    await expectOutbox(1)
    expect(t.outbox[0]?.to).toBe(marie.email)
    expect(t.outbox[0]?.text).toContain("l'hébergeur")
  })
})

describe('messages', () => {
  it('question hébergeur → main au demandeur + délai relancé ; réponse → main à l’hébergeur ; tiers → 404', async () => {
    expect((await createReq(marie.cookie, listing1)).status).toBe(201)
    const id = await reqIdOf(listing1, marie.id)
    await expectOutbox(1)
    t.outbox.length = 0

    // vieillit la demande pour vérifier que le message remet le délai à zéro
    await t.db.lodgingRequest.update({
      where: { id },
      data: { lastActivityAt: new Date(Date.now() - 3 * DAY_MS) },
    })
    const listingBefore = await t.db.listing.findUniqueOrThrow({
      where: { id: listing1 },
      select: { lastHostActivityAt: true },
    })

    expect(
      (
        await postJson(`/api/requests/${id}/messages`, claire.cookie, {
          body: 'Avez-vous un animal ?',
        })
      ).status,
    ).toBe(200)

    const afterQuestion = await requestRow(id)
    expect(afterQuestion.awaitingSide).toBe('REQUESTER')
    expect(Date.now() - afterQuestion.lastActivityAt.getTime()).toBeLessThan(60_000)

    // toute action hébergeur touche lastHostActivityAt (anti-faux-positif du masquage)
    const listingAfter = await t.db.listing.findUniqueOrThrow({
      where: { id: listing1 },
      select: { lastHostActivityAt: true },
    })
    expect(listingAfter.lastHostActivityAt.getTime()).toBeGreaterThan(
      listingBefore.lastHostActivityAt.getTime(),
    )

    await expectOutbox(1)
    expect(t.outbox[0]?.to).toBe(marie.email)
    expect(t.outbox[0]?.subject).toContain('Claire M.')
    expect(t.outbox[0]?.text).toContain('Avez-vous un animal ?')

    expect(
      (await postJson(`/api/requests/${id}/messages`, marie.cookie, { body: 'Non, aucun.' }))
        .status,
    ).toBe(200)
    expect((await requestRow(id)).awaitingSide).toBe('HOST')
    await expectOutbox(2)
    expect(t.outbox[1]?.to).toBe(claire.email)

    // un tiers (ni demandeur ni hébergeur) n'apprend même pas que la demande existe
    expect(
      (await postJson(`/api/requests/${id}/messages`, pierre.cookie, { body: 'Coucou' })).status,
    ).toBe(404)

    // le fil expose l'auteur de chaque message
    const my = await getJson<MyRequestsBody>('/api/my/requests', marie.cookie)
    const item = my.items.find((row) => row.id === id)
    expect(item?.messages.map((message) => message.from)).toEqual([
      'REQUESTER',
      'HOST',
      'REQUESTER',
    ])
  })
})

describe('expiration logique (avant tout passage du job)', () => {
  it('demande à −8 j : accept et message → 409, la lecture la présente EXPIRED', async () => {
    expect((await createReq(marie.cookie, listing1)).status).toBe(201)
    const id = await reqIdOf(listing1, marie.id)
    await expectOutbox(1)
    await t.db.lodgingRequest.update({
      where: { id },
      data: { lastActivityAt: new Date(Date.now() - 8 * DAY_MS) },
    })

    expect((await postJson(`/api/requests/${id}/accept`, claire.cookie)).status).toBe(409)
    expect(
      (await postJson(`/api/requests/${id}/messages`, marie.cookie, { body: 'Toujours là ?' }))
        .status,
    ).toBe(409)

    const my = await getJson<MyRequestsBody>('/api/my/requests', marie.cookie)
    const item = my.items.find((row) => row.id === id)
    expect(item?.status).toBe('PENDING') // le job n'est pas passé…
    expect(item?.effectiveStatus).toBe('EXPIRED') // …mais la vue ne ment pas
    expect(my.pendingCount).toBe(0) // et le quota est déjà libéré
  })
})

describe('garde-fous de création', () => {
  it('hôtel → 409 (réservation sur la plateforme de l’hôtel)', async () => {
    const res = await createReq(marie.cookie, hotelListing)
    expect(res.status).toBe(409)
    expect(((await res.json()) as ErrorBody).error.message).toContain('hôtel')
  })

  it('base scout avec lien → 409 (réservation externe, comme un hôtel)', async () => {
    const res = await createReq(marie.cookie, scoutBaseAvecLien)
    expect(res.status).toBe(409)
    expect(((await res.json()) as ErrorBody).error.message).toContain('lien de réservation')
  })

  it('base scout sans lien → 201 (flux de demande standard, comme un gymnase)', async () => {
    expect((await createReq(marie.cookie, scoutBaseSansLien)).status).toBe(201)
  })

  it('son propre logement → 409', async () => {
    expect((await createReq(claire.cookie, listing1)).status).toBe(409)
  })

  it('SCOUT_UNIT → 403 (cloisonnement des parcours)', async () => {
    expect((await createReq(unite.cookie, listing1)).status).toBe(403)
  })

  it('logement complet (FULL) → 409', async () => {
    const full = await mkListing(noe.id, { status: 'FULL' })
    expect((await createReq(marie.cookie, full)).status).toBe(409)
  })

  it("logement masqué → 404 (son existence n'est pas révélée)", async () => {
    const hidden = await mkListing(noe.id, { hiddenAt: new Date() })
    expect((await createReq(marie.cookie, hidden)).status).toBe(404)
  })

  it('dates incohérentes ou hors disponibilité → 400', async () => {
    const inverted = await createReq(marie.cookie, listing1, {
      dateFrom: '2026-09-27',
      dateTo: '2026-09-25',
    })
    expect(inverted.status).toBe(400)
    const outside = await createReq(marie.cookie, listing1, {
      dateFrom: '2026-09-10',
      dateTo: '2026-09-26',
    })
    expect(outside.status).toBe(400)
    expect(((await outside.json()) as ErrorBody).error.code).toBe('VALIDATION_ERROR')
  })
})

describe('minimisation des vues', () => {
  it('vue hébergeur : téléphone + besoins + sur-capacité — vue demandeur PENDING : ni contact ni adresse', async () => {
    expect((await createReq(marie.cookie, listing1, { peopleCount: 5 })).status).toBe(201)
    await expectOutbox(1)

    const received = await getJson<ReceivedBody>('/api/my/received-requests', claire.cookie)
    expect(received.items).toHaveLength(1)
    expect(received.items[0]?.requester).toEqual({
      firstName: 'Marie',
      lastName: 'Lefèvre',
      phone: '+33612345601',
      needs: ['pmr'],
    })
    expect(received.items[0]?.overCapacity).toBe(true) // 5 personnes pour 4 places
    const receivedRaw = JSON.stringify(received)
    expect(receivedRaw).not.toContain(marie.email) // le mail du demandeur ne sort jamais
    expect(receivedRaw).not.toContain('addressFull')

    const myRes = await t.app.request('/api/my/requests', { headers: { cookie: marie.cookie } })
    expect(myRes.status).toBe(200)
    const rawBody = await myRes.text()
    // assertions d'ABSENCE sur le corps brut : la clé n'existe même pas
    expect(rawBody).not.toContain('hostContact')
    expect(rawBody).not.toContain('addressFull')
    expect(rawBody).not.toContain(DEFAULT_ADDRESS)
    expect(rawBody).not.toContain('+33612345603') // téléphone de l'hébergeuse
    expect(rawBody).not.toContain(claire.email)

    const my = JSON.parse(rawBody) as MyRequestsBody
    expect(my.items[0]?.hostDisplayName).toBe('Claire M.')
    expect(my.items[0]?.listing.displayArea).toBe('Paris 12e')
    expect(my.pendingCount).toBe(1)
  })
})

describe('job quotidien', () => {
  it('expire une PENDING périmée, prévient les deux côtés — hébergeur actif : logement PAS masqué', async () => {
    expect((await createReq(marie.cookie, listing1)).status).toBe(201)
    const id = await reqIdOf(listing1, marie.id)
    await expectOutbox(1)
    await t.db.lodgingRequest.update({
      where: { id },
      data: { lastActivityAt: new Date(Date.now() - 8 * DAY_MS) },
    })
    // hébergeuse active par ailleurs → anti-faux-positif : pas de masquage
    await t.db.listing.update({
      where: { id: listing1 },
      data: { lastHostActivityAt: new Date() },
    })
    t.outbox.length = 0

    const summary = await runDailyJob()
    expect(summary.expired).toBe(1)
    expect(summary.listingsHidden).toBe(0)
    expect(summary.remindersSent).toBe(0)

    expect((await requestRow(id)).status).toBe('EXPIRED')
    const listing = await t.db.listing.findUniqueOrThrow({
      where: { id: listing1 },
      select: { hiddenAt: true },
    })
    expect(listing.hiddenAt).toBeNull()

    expect(t.outbox.map((email) => email.to).sort()).toEqual([claire.email, marie.email].sort())
    expect(t.outbox.every((email) => email.text.includes('a expiré'))).toBe(true)
    expect(new Set(t.outbox.map((email) => email.idempotencyKey))).toEqual(
      new Set([`expired/${id}`, `expired-host/${id}`]),
    )
  })

  it('hébergeur inactif : logement masqué + email + expiration groupée des demandes sœurs en attente', async () => {
    const hugo = await mkIndividual('Hugo', 'Blanc', 'hugo@example.org', '+33612345608')
    const inactive = await mkListing(hugo.id, {
      lastHostActivityAt: new Date(Date.now() - 9 * DAY_MS),
    })
    expect((await createReq(marie.cookie, inactive)).status).toBe(201)
    const stale = await reqIdOf(inactive, marie.id)
    expect((await createReq(pierre.cookie, inactive)).status).toBe(201)
    const fresh = await reqIdOf(inactive, pierre.id) // FRAÎCHE, mais en attente du même hébergeur
    await t.db.lodgingRequest.update({
      where: { id: stale },
      data: { lastActivityAt: new Date(Date.now() - 8 * DAY_MS) },
    })
    await expectOutbox(2)
    t.outbox.length = 0

    const summary = await runDailyJob()
    expect(summary.expired).toBe(2)
    expect(summary.listingsHidden).toBe(1)

    expect((await requestRow(stale)).status).toBe('EXPIRED')
    expect((await requestRow(fresh)).status).toBe('EXPIRED') // groupée : hébergeur injoignable
    const listing = await t.db.listing.findUniqueOrThrow({
      where: { id: inactive },
      select: { hiddenAt: true },
    })
    expect(listing.hiddenAt).not.toBeNull()

    expect(t.outbox).toHaveLength(5) // 2 × 2 expirations + 1 masquage
    const hiddenEmail = t.outbox.find((email) => email.subject.includes('masqué'))
    expect(hiddenEmail?.to).toBe('hugo@example.org')
    expect(hiddenEmail?.idempotencyKey).toBe(`listing-hidden/${inactive}`)
  })

  it('hébergeur actif par ailleurs : la demande expire mais le logement reste visible', async () => {
    const iris = await mkIndividual('Iris', 'Morel', 'iris@example.org', '+33612345609')
    const active = await mkListing(iris.id, { lastHostActivityAt: new Date() })
    expect((await createReq(marie.cookie, active)).status).toBe(201)
    const id = await reqIdOf(active, marie.id)
    await t.db.lodgingRequest.update({
      where: { id },
      data: { lastActivityAt: new Date(Date.now() - 8 * DAY_MS) },
    })
    await expectOutbox(1)
    t.outbox.length = 0

    const summary = await runDailyJob()
    expect(summary.expired).toBe(1)
    expect(summary.listingsHidden).toBe(0)
    const listing = await t.db.listing.findUniqueOrThrow({
      where: { id: active },
      select: { hiddenAt: true },
    })
    expect(listing.hiddenAt).toBeNull()
  })

  it('relance quotidienne : « expire dans N jours » au côté attendu, lastReminderAt posé', async () => {
    expect((await createReq(marie.cookie, listing2)).status).toBe(201)
    const id = await reqIdOf(listing2, marie.id)
    await t.db.lodgingRequest.update({
      where: { id },
      data: { lastActivityAt: new Date(Date.now() - 2 * DAY_MS) },
    })
    await expectOutbox(1)
    t.outbox.length = 0

    const summary = await runDailyJob()
    expect(summary.remindersSent).toBe(1)
    expect(summary.expired).toBe(0)

    expect(t.outbox).toHaveLength(1)
    const reminder = t.outbox[0]
    expect(reminder?.to).toBe(karim.email) // awaitingSide HOST → l'hébergeur est relancé
    expect(reminder?.subject).toContain('Réponse attendue')
    expect(reminder?.text).toContain('5 jours') // ceil(7 j − 2 j)
    expect(reminder?.idempotencyKey).toBe(`reminder/${id}/${new Date().toISOString().slice(0, 10)}`)
    expect((await requestRow(id)).lastReminderAt).not.toBeNull()
  })

  it('DOUBLE exécution immédiate : aucun nouvel email, aucune nouvelle transition', async () => {
    // une périmée qui masque son logement + une à relancer
    expect((await createReq(marie.cookie, listing1)).status).toBe(201)
    const expiredId = await reqIdOf(listing1, marie.id)
    expect((await createReq(pierre.cookie, listing2)).status).toBe(201)
    const remindedId = await reqIdOf(listing2, pierre.id)
    await t.db.lodgingRequest.update({
      where: { id: expiredId },
      data: { lastActivityAt: new Date(Date.now() - 8 * DAY_MS) },
    })
    await t.db.lodgingRequest.update({
      where: { id: remindedId },
      data: { lastActivityAt: new Date(Date.now() - 2 * DAY_MS) },
    })
    await t.db.listing.update({
      where: { id: listing1 },
      data: { lastHostActivityAt: new Date(Date.now() - 8 * DAY_MS) },
    })
    await expectOutbox(2)
    t.outbox.length = 0

    const first = await runDailyJob()
    expect(first).toMatchObject({ expired: 1, remindersSent: 1, listingsHidden: 1 })
    const outboxAfterFirst = t.outbox.length
    const stateAfterFirst = await t.db.lodgingRequest.findMany({
      select: { id: true, status: true, lastReminderAt: true, lastActivityAt: true },
      orderBy: { id: 'asc' },
    })

    const second = await runDailyJob()
    expect(second).toMatchObject({
      expired: 0,
      remindersSent: 0,
      listingsHidden: 0,
      shellsPurged: 0,
    })
    expect(t.outbox.length).toBe(outboxAfterFirst) // pas UN email de plus
    expect(
      await t.db.lodgingRequest.findMany({
        select: { id: true, status: true, lastReminderAt: true, lastActivityAt: true },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(stateAfterFirst)

    // remet la fixture en état pour la suite
    await t.db.listing.update({
      where: { id: listing1 },
      data: { hiddenAt: null, lastHostActivityAt: new Date() },
    })
  })

  it('purge des coquilles : sans session après 7 j → supprimée ; avec session → conservée', async () => {
    const old = new Date(Date.now() - 8 * DAY_MS)
    const gone = await t.db.user.create({
      data: { email: 'coquille-morte@example.org', createdAt: old },
      select: { id: true },
    })
    const kept = await t.db.user.create({
      data: { email: 'coquille-vivante@example.org', createdAt: old },
      select: { id: true },
    })
    await createSession(t.db, kept.id) // a cliqué le lien : session → conservée

    const summary = await runDailyJob()
    expect(summary.shellsPurged).toBe(1)
    expect(await t.db.user.findUnique({ where: { id: gone.id }, select: { id: true } })).toBeNull()
    expect(
      await t.db.user.findUnique({ where: { id: kept.id }, select: { id: true } }),
    ).not.toBeNull()
  })

  it('re-synchronise la capacité dénormalisée dérivée des couchages', async () => {
    await t.db.listing.update({ where: { id: listing3 }, data: { capacity: 99 } })
    await runDailyJob()
    const listing = await t.db.listing.findUniqueOrThrow({
      where: { id: listing3 },
      select: { capacity: true },
    })
    expect(listing.capacity).toBe(4) // 2 chambres × 2 personnes
  })

  it('POST /internal/jobs/daily : 401 sans secret ou mauvais secret, 200 avec le bon', async () => {
    const noHeader = await t.app.request('/api/internal/jobs/daily', { method: 'POST' })
    expect(noHeader.status).toBe(401)

    const wrong = await t.app.request('/api/internal/jobs/daily', {
      method: 'POST',
      headers: { 'x-job-secret': 'mauvais-secret-0000000000' },
    })
    expect(wrong.status).toBe(401)

    const ok = await t.app.request('/api/internal/jobs/daily', {
      method: 'POST',
      headers: { 'x-job-secret': JOB_SECRET },
    })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true })
  })
})

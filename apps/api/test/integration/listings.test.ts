/**
 * Routes logements (plan v1 « Routes logements » + « Intégrité & concurrence ») :
 * capacité dénormalisée = Σ couchages recalculée en transaction, displayArea/distanceKm
 * dérivées de l'adresse BAN, recherche filtrée (site, couverture de dates, capacité,
 * types OR catégories, accessibilité AND, FULL et masqués exclus, tri distance nulls
 * last), minimisation stricte des cartes (§5 — jamais l'adresse), ownership sans
 * distinction 403/404, annulation + notification des ACCEPTED avant suppression.
 */
import { ListingCardSchema } from '@repo/contracts'
import { siteBySlug } from '@repo/event-config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { haversineKm } from '../../src/lib/geocode'
import {
  extractToken,
  resetRateLimiters,
  sessionCookieOf,
  startTestEnv,
  type TestEnv,
} from '../helpers/testenv'

let t: TestEnv

let claire: string // cookie hébergeuse (INDIVIDUAL)
let claireId: string
let marie: string // cookie demandeuse (INDIVIDUAL)
let marieId: string
let uniteCookie: string // cookie unité scoute (SCOUT_UNIT)
let paulId: string // demandeur secondaire, jamais loggé

// Fixtures de recherche (créées au beforeAll racine, partagées entre describes)
let coversId: string // Paris 12e, 24→29, cap 8, pmr + fewSteps
let narrowId: string // Montreuil, 26→28, cap 2, aucun critère
let metzId: string // Metz, 24→29, emplacements tente
let fullId: string // Paris, passé FULL via l'API
let hiddenId: string // Paris, masqué (hiddenAt posé)
let hotelId: string // Paris, HOTEL institutionnel, distanceKm inconnue

const PARIS_12E = {
  label: '12 Rue des Boulets 75012 Paris',
  city: 'Paris',
  postcode: '75012',
  lat: 48.8496,
  lng: 2.3915,
}

const MONTREUIL = {
  label: '5 Rue de la Révolution 93100 Montreuil',
  city: 'Montreuil',
  postcode: '93100',
  lat: 48.8638,
  lng: 2.4485,
}

const METZ_CENTRE = {
  label: '3 Place Saint-Louis 57000 Metz',
  city: 'Metz',
  postcode: '57000',
  lat: 49.1197,
  lng: 6.1764,
}

const NO_ACCESS = {
  pmr: false,
  electricWheelchair: false,
  fewSteps: false,
  humanHelp: false,
  transport: false,
  parking: false,
  assistanceDog: false,
  quiet: false,
}

/** 2×2 + 1×2 + 2×1 = 8 places */
const DEFAULT_BEDS = [
  { type: 'PRIVATE_ROOM', count: 2, capacityEach: 2 },
  { type: 'COUCH', count: 1, capacityEach: 2 },
  { type: 'FLOOR_BED', count: 2, capacityEach: 1 },
]

function listingBody(overrides: Record<string, unknown> = {}) {
  return {
    site: 'paris',
    availableFrom: '2026-09-24',
    availableTo: '2026-09-29',
    address: PARIS_12E,
    beds: DEFAULT_BEDS,
    access: NO_ACCESS,
    ...overrides,
  }
}

interface MyListingBody {
  id: string
  title: string
  category: string
  status: string
  capacity: number
  displayArea: string
  distanceKm: number | null
  availableFrom: string
  availableTo: string
  addressFull: string
  hiddenAt: string | null
  pendingRequests: number
  acceptedPeople: number
  bedTypes: string[]
  beds: Array<{ type: string; count: number; capacityEach: number; note: string | null }>
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  return t.app.request(`/api${path}`, init)
}

function jsonHeaders(cookie: string): Record<string, string> {
  return { 'content-type': 'application/json', cookie }
}

/** Connexion par le flux magic link — le seul mécanisme d'auth (pas de raccourci). */
async function loginAs(email: string): Promise<string> {
  t.outbox.length = 0
  await resetRateLimiters()
  await api('/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  await vi.waitFor(() => expect(t.outbox.length).toBeGreaterThan(0))
  const mail = t.outbox.at(-1)
  if (!mail) throw new Error('outbox vide')
  const callback = await api(`/auth/callback?token=${extractToken(mail)}`)
  const cookie = sessionCookieOf(callback)
  t.outbox.length = 0
  return cookie
}

async function createListingAs(
  cookie: string,
  overrides: Record<string, unknown> = {},
): Promise<MyListingBody> {
  const res = await api('/my/listings', {
    method: 'POST',
    headers: jsonHeaders(cookie),
    body: JSON.stringify(listingBody(overrides)),
  })
  expect(res.status).toBe(201)
  return (await res.json()) as MyListingBody
}

interface SearchResult {
  items: Array<Record<string, unknown> & { id: string }>
  total: number
}

async function search(params: Record<string, string | string[]>): Promise<SearchResult> {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const v of value) qs.append(key, v)
    else qs.set(key, value)
  }
  const res = await api(`/listings?${qs.toString()}`, { headers: { cookie: marie } })
  expect(res.status).toBe(200)
  return (await res.json()) as SearchResult
}

function ids(items: Array<{ id: string }>): string[] {
  return items.map((item) => item.id)
}

beforeAll(async () => {
  t = await startTestEnv()

  const onboarded = { accountType: 'INDIVIDUAL', onboardedAt: new Date() } as const
  claireId = (
    await t.db.user.create({
      data: {
        ...onboarded,
        firstName: 'Claire',
        lastName: 'Martin',
        email: 'claire@example.org',
        phone: '+33600000001',
      },
      select: { id: true },
    })
  ).id
  marieId = (
    await t.db.user.create({
      data: {
        ...onboarded,
        firstName: 'Marie',
        lastName: 'Lefèvre',
        email: 'marie@example.org',
        phone: '+33600000002',
      },
      select: { id: true },
    })
  ).id
  paulId = (
    await t.db.user.create({
      data: {
        ...onboarded,
        firstName: 'Paul',
        lastName: 'Girard',
        email: 'paul@example.org',
        phone: '+33600000004',
      },
      select: { id: true },
    })
  ).id
  await t.db.user.create({
    data: {
      accountType: 'SCOUT_UNIT',
      unitName: '1re Nancy',
      unitBranch: 'Pionniers-Caravelles',
      firstName: 'Nina',
      lastName: 'Colin',
      email: 'unite@example.org',
      phone: '+33600000003',
      onboardedAt: new Date(),
    },
  })

  claire = await loginAs('claire@example.org')
  marie = await loginAs('marie@example.org')
  uniteCookie = await loginAs('unite@example.org')

  // Fixtures de recherche
  coversId = (
    await createListingAs(claire, { access: { ...NO_ACCESS, pmr: true, fewSteps: true } })
  ).id
  narrowId = (
    await createListingAs(claire, {
      availableFrom: '2026-09-26',
      availableTo: '2026-09-28',
      address: MONTREUIL,
      beds: [{ type: 'COUCH', count: 1, capacityEach: 2 }],
    })
  ).id
  metzId = (
    await createListingAs(claire, {
      site: 'metz',
      address: METZ_CENTRE,
      beds: [{ type: 'TENT_SPOT', count: 4, capacityEach: 1 }],
    })
  ).id
  fullId = (await createListingAs(claire)).id
  const toFull = await api(`/my/listings/${fullId}/status`, {
    method: 'PATCH',
    headers: jsonHeaders(claire),
    body: JSON.stringify({ status: 'FULL' }),
  })
  expect(toFull.status).toBe(200)
  hiddenId = (await createListingAs(claire)).id
  await t.db.listing.update({ where: { id: hiddenId }, data: { hiddenAt: new Date() } })

  // Logement institutionnel : hors périmètre des routes hébergeur (créées par l'admin),
  // posé en base directement — distance inconnue pour vérifier le tri nulls last.
  hotelId = (
    await t.db.listing.create({
      data: {
        ownerId: claireId,
        category: 'HOTEL',
        site: 'paris',
        title: 'Hôtel Ibis Nation',
        addressFull: '25 Avenue de la Porte de Vincennes 75012 Paris',
        displayArea: 'Paris 12e',
        distanceKm: null,
        availableFrom: new Date('2026-09-20'),
        availableTo: new Date('2026-10-02'),
        capacity: 30,
        priceInfo: '45 € · code PAPE15',
        bookingUrl: 'https://hotel.example.org/reservation',
      },
      select: { id: true },
    })
  ).id
})

afterAll(async () => {
  await t.stop()
})

describe('création', () => {
  let createdId: string

  it('capacité = Σ (count × capacityEach), displayArea et distanceKm dérivées', async () => {
    const created = await createListingAs(claire, { description: 'Grand appartement lumineux' })
    createdId = created.id

    expect(created.capacity).toBe(8) // 2×2 + 1×2 + 2×1
    expect(created.category).toBe('PRIVATE') // forcée, quoi que dise le body
    expect(created.status).toBe('OPEN')
    expect(created.displayArea).toBe('Paris 12e') // dérivée de 75012
    expect(created.availableFrom).toBe('2026-09-24')
    expect(created.availableTo).toBe('2026-09-29')

    const parisSite = siteBySlug('paris')
    if (!parisSite) throw new Error('site paris absent de la config')
    expect(created.distanceKm).toBe(Math.round(haversineKm(parisSite.coords, PARIS_12E) * 10) / 10)
    expect(created.distanceKm).toBeCloseTo(3.1, 1)

    expect(created.title).toContain('Chez Claire')
    // Vue propriétaire : sa propre adresse, déchiffrée par l'extension
    expect(created.addressFull).toBe(PARIS_12E.label)
    expect(created.pendingRequests).toBe(0)
    expect(created.acceptedPeople).toBe(0)
  })

  it('GET /my/listings expose la vue propriétaire (adresse comprise)', async () => {
    const res = await api('/my/listings', { headers: { cookie: claire } })
    expect(res.status).toBe(200)
    const { items } = (await res.json()) as { items: MyListingBody[] }
    const mine = items.find((item) => item.id === createdId)
    expect(mine).toBeDefined()
    expect(mine?.addressFull).toBe(PARIS_12E.label)
    expect(mine?.hiddenAt).toBeNull()
    expect(mine?.pendingRequests).toBe(0)
    expect(mine?.acceptedPeople).toBe(0)
  })

  it('l’adresse complète ne sort JAMAIS sur la fiche publique (stockée chiffrée)', async () => {
    // La vérification du chiffrement au repos vit dans packages/db ($queryRaw interdit
    // ici) — on vérifie la surface API : l'adresse n'apparaît nulle part.
    const res = await api(`/listings/${createdId}`, { headers: { cookie: marie } })
    expect(res.status).toBe(200)
    const dump = await res.text()
    expect(dump).not.toContain('Rue des Boulets')
    expect(dump).not.toContain('addressFull')
  })

  it('parkingEase : absent → null, renseigné → aller-retour sur la fiche publique', async () => {
    // Créée sans parkingEase plus haut : la fiche publique le rend null.
    const sans = await api(`/listings/${createdId}`, { headers: { cookie: marie } })
    expect(((await sans.json()) as { parkingEase: string | null }).parkingEase).toBeNull()

    // PATCH sans address (adresse conservée) — le champ se pose et ressort.
    const { address: _address, ...bodySansAdresse } = listingBody({
      description: 'Grand appartement lumineux',
    })
    const patch = await api(`/my/listings/${createdId}`, {
      method: 'PATCH',
      headers: jsonHeaders(claire),
      body: JSON.stringify({ ...bodySansAdresse, parkingEase: 'MEDIUM' }),
    })
    expect(patch.status).toBe(200)
    const avec = await api(`/listings/${createdId}`, { headers: { cookie: marie } })
    expect(((await avec.json()) as { parkingEase: string | null }).parkingEase).toBe('MEDIUM')
  })

  it('rejette availableFrom ≥ availableTo (VALIDATION_ERROR)', async () => {
    const res = await api('/my/listings', {
      method: 'POST',
      headers: jsonHeaders(claire),
      body: JSON.stringify(listingBody({ availableFrom: '2026-09-29', availableTo: '2026-09-24' })),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('recherche', () => {
  it('filtre par site', async () => {
    const paris = await search({ site: 'paris' })
    expect(ids(paris.items)).toContain(coversId)
    expect(ids(paris.items)).not.toContain(metzId)

    const metz = await search({ site: 'metz' })
    expect(ids(metz.items)).toContain(metzId)
    expect(ids(metz.items)).not.toContain(coversId)
  })

  it('couverture de dates : un logement 24→29 matche 25→28, un 26→28 non', async () => {
    const result = await search({ site: 'paris', from: '2026-09-25', to: '2026-09-28' })
    expect(ids(result.items)).toContain(coversId)
    expect(ids(result.items)).not.toContain(narrowId)
  })

  it('capacité : people=4 exclut le logement de 2 places', async () => {
    const result = await search({ site: 'paris', people: '4' })
    expect(ids(result.items)).toContain(coversId) // 8 places
    expect(ids(result.items)).not.toContain(narrowId) // 2 places
  })

  it('types : OR entre types de couchages et catégories institutionnelles', async () => {
    const rooms = await search({ site: 'paris', types: ['PRIVATE_ROOM'] })
    expect(ids(rooms.items)).toContain(coversId)
    expect(ids(rooms.items)).not.toContain(narrowId) // canapé seulement
    expect(ids(rooms.items)).not.toContain(hotelId) // pas de lignes de couchages

    const hotels = await search({ site: 'paris', types: ['HOTEL'] })
    expect(ids(hotels.items)).toContain(hotelId) // chip Hôtel → catégorie
    expect(ids(hotels.items)).not.toContain(coversId)

    const both = await search({ site: 'paris', types: ['PRIVATE_ROOM', 'HOTEL'] })
    expect(ids(both.items)).toEqual(expect.arrayContaining([coversId, hotelId]))
    expect(ids(both.items)).not.toContain(narrowId)
  })

  it('accessibilité : AND sur chaque critère coché', async () => {
    const matching = await search({ site: 'paris', access: ['pmr', 'fewSteps'] })
    expect(ids(matching.items)).toContain(coversId)

    const tooStrict = await search({ site: 'paris', access: ['pmr', 'parking'] })
    expect(ids(tooStrict.items)).not.toContain(coversId) // parking manquant
  })

  it('stationnement : facilité minimale, non renseigné exclu du filtre', async () => {
    // parkingEase n'est pas chiffré : pose directe en base sur les fixtures.
    await t.db.listing.update({ where: { id: coversId }, data: { parkingEase: 'EASY' } })
    await t.db.listing.update({ where: { id: narrowId }, data: { parkingEase: 'HARD' } })

    const easy = await search({ site: 'paris', parking: 'EASY' })
    expect(ids(easy.items)).toContain(coversId)
    expect(ids(easy.items)).not.toContain(narrowId) // HARD < minimum exigé
    expect(ids(easy.items)).not.toContain(hotelId) // null = exclu

    const atLeastHard = await search({ site: 'paris', parking: 'HARD' })
    expect(ids(atLeastHard.items)).toEqual(expect.arrayContaining([coversId, narrowId]))
    expect(ids(atLeastHard.items)).not.toContain(hotelId)

    const sansFiltre = await search({ site: 'paris' })
    expect(ids(sansFiltre.items)).toContain(hotelId) // sans filtre, null visible
    const carte = sansFiltre.items.find((item) => item.id === coversId)
    expect(carte?.parkingEase).toBe('EASY') // exposé sur la carte (jauge)
  })

  it('exclut les logements complets (FULL) et masqués (hiddenAt)', async () => {
    const result = await search({ site: 'paris' })
    expect(ids(result.items)).not.toContain(fullId)
    expect(ids(result.items)).not.toContain(hiddenId)
  })

  it('trie par distance croissante, valeurs inconnues en dernier', async () => {
    const order = ids((await search({ site: 'paris' })).items)
    const covers = order.indexOf(coversId) // ≈ 3,1 km
    const farther = order.indexOf(narrowId) // ≈ 7,3 km
    const unknown = order.indexOf(hotelId) // null
    expect(covers).toBeGreaterThanOrEqual(0)
    expect(farther).toBeGreaterThan(covers)
    expect(unknown).toBeGreaterThan(farther)
  })
})

describe('minimisation (§5)', () => {
  it('les clés d’une carte sont EXACTEMENT celles de ListingCardSchema', async () => {
    const result = await search({ site: 'paris' })
    expect(result.items.length).toBeGreaterThan(0)
    const expectedKeys = Object.keys(ListingCardSchema.shape).sort()
    for (const card of result.items) {
      expect(Object.keys(card).sort()).toEqual(expectedKeys)
    }
    const dump = JSON.stringify(result.items)
    expect(dump).not.toContain('addressFull')
    expect(dump).not.toContain('Rue des Boulets')
    expect(dump).not.toContain('ownerId')
    expect(dump).not.toContain('phone')
  })
})

describe('fiche', () => {
  it('identité hébergeur réduite à « Prénom I. »', async () => {
    const res = await api(`/listings/${coversId}`, { headers: { cookie: marie } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { hostDisplayName: string | null }
    expect(body.hostDisplayName).toBe('Claire M.')
  })

  it('institutionnel : title en base, hostDisplayName null, bookingUrl exposée', async () => {
    const res = await api(`/listings/${hotelId}`, { headers: { cookie: marie } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      title: string
      hostDisplayName: string | null
      bookingUrl: string | null
      priceInfo: string | null
    }
    expect(body.title).toBe('Hôtel Ibis Nation')
    expect(body.hostDisplayName).toBeNull()
    expect(body.bookingUrl).toBe('https://hotel.example.org/reservation')
    expect(body.priceInfo).toBe('45 € · code PAPE15')
  })

  it('le propriétaire voit son logement masqué, un tiers reçoit 404', async () => {
    const owner = await api(`/listings/${hiddenId}`, { headers: { cookie: claire } })
    expect(owner.status).toBe(200)

    const other = await api(`/listings/${hiddenId}`, { headers: { cookie: marie } })
    expect(other.status).toBe(404)
  })

  it('404 pour un logement inexistant', async () => {
    const res = await api('/listings/nexistepas', { headers: { cookie: marie } })
    expect(res.status).toBe(404)
  })
})

describe('ownership', () => {
  it('PATCH du logement d’un autre → 404 (pas de distinction 403/404)', async () => {
    const res = await api(`/my/listings/${coversId}`, {
      method: 'PATCH',
      headers: jsonHeaders(marie),
      body: JSON.stringify(listingBody()),
    })
    expect(res.status).toBe(404)
  })

  it('DELETE du logement d’un autre → 404, rien n’est supprimé', async () => {
    const res = await api(`/my/listings/${coversId}`, {
      method: 'DELETE',
      headers: { cookie: marie },
    })
    expect(res.status).toBe(404)
    const still = await t.db.listing.findUnique({
      where: { id: coversId },
      select: { id: true },
    })
    expect(still).not.toBeNull()
  })

  it('une unité scoute ne crée pas de logement (403, cloisonnement)', async () => {
    const res = await api('/my/listings', {
      method: 'POST',
      headers: jsonHeaders(uniteCookie),
      body: JSON.stringify(listingBody()),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('FORBIDDEN')
  })
})

describe('statut', () => {
  it('FULL sort de la recherche ; repasser OPEN réactive et remet hiddenAt à null', async () => {
    const listing = await createListingAs(claire)
    expect(ids((await search({ site: 'paris' })).items)).toContain(listing.id)

    const toFull = await api(`/my/listings/${listing.id}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(claire),
      body: JSON.stringify({ status: 'FULL' }),
    })
    expect(toFull.status).toBe(200)
    expect(((await toFull.json()) as MyListingBody).status).toBe('FULL')
    expect(ids((await search({ site: 'paris' })).items)).not.toContain(listing.id)

    // Masquage automatique simulé, puis action explicite = hébergeur actif
    await t.db.listing.update({ where: { id: listing.id }, data: { hiddenAt: new Date() } })
    const toOpen = await api(`/my/listings/${listing.id}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(claire),
      body: JSON.stringify({ status: 'OPEN' }),
    })
    expect(toOpen.status).toBe(200)
    const reopened = (await toOpen.json()) as MyListingBody
    expect(reopened.status).toBe('OPEN')
    expect(reopened.hiddenAt).toBeNull()

    const inDb = await t.db.listing.findUnique({
      where: { id: listing.id },
      select: { hiddenAt: true },
    })
    expect(inDb?.hiddenAt).toBeNull()
    expect(ids((await search({ site: 'paris' })).items)).toContain(listing.id)
  })

  it('statut d’un logement inconnu → 404', async () => {
    const res = await api('/my/listings/nexistepas/status', {
      method: 'PATCH',
      headers: jsonHeaders(claire),
      body: JSON.stringify({ status: 'FULL' }),
    })
    expect(res.status).toBe(404)
  })
})

describe('modification', () => {
  it('remplace les couchages en bloc et recalcule la capacité', async () => {
    const listing = await createListingAs(claire)
    expect(listing.capacity).toBe(8)

    const res = await api(`/my/listings/${listing.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(claire),
      body: JSON.stringify(
        listingBody({
          beds: [
            { type: 'PRIVATE_ROOM', count: 1, capacityEach: 2 },
            { type: 'TENT_SPOT', count: 3, capacityEach: 1 },
          ],
        }),
      ),
    })
    expect(res.status).toBe(200)
    const updated = (await res.json()) as MyListingBody
    expect(updated.capacity).toBe(5) // 1×2 + 3×1, recalcul complet
    expect(updated.beds).toHaveLength(2)
    expect(updated.bedTypes).toContain('TENT_SPOT')

    // Remplacées en base (deleteMany + createMany), pas empilées
    expect(await t.db.listingBed.count({ where: { listingId: listing.id } })).toBe(2)
    const row = await t.db.listing.findUnique({
      where: { id: listing.id },
      select: { capacity: true },
    })
    expect(row?.capacity).toBe(5)
  })
})

describe('suppression', () => {
  it('annule les ACCEPTED (e-mail aux demandeurs) puis supprime en cascade', async () => {
    const listing = await createListingAs(claire)
    const accepted = await t.db.lodgingRequest.create({
      data: {
        listingId: listing.id,
        requesterId: marieId,
        dateFrom: new Date('2026-09-25'),
        dateTo: new Date('2026-09-28'),
        peopleCount: 2,
        status: 'ACCEPTED',
        awaitingSide: 'HOST',
      },
      select: { id: true },
    })
    // Une PENDING d'un autre demandeur : supprimée par cascade mais PAS notifiée
    await t.db.lodgingRequest.create({
      data: {
        listingId: listing.id,
        requesterId: paulId,
        dateFrom: new Date('2026-09-25'),
        dateTo: new Date('2026-09-28'),
        peopleCount: 1,
        status: 'PENDING',
        awaitingSide: 'HOST',
      },
    })

    t.outbox.length = 0
    const res = await api(`/my/listings/${listing.id}`, {
      method: 'DELETE',
      headers: { cookie: claire },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    // Notification fire-and-forget après l'écriture — au demandeur ACCEPTED uniquement
    await vi.waitFor(() => expect(t.outbox.length).toBe(1))
    const mail = t.outbox[0]
    expect(mail?.to).toBe('marie@example.org')
    expect(mail?.subject).toContain('annulée')
    expect(mail?.text).toContain("l'hébergeur")
    expect(mail?.idempotencyKey).toBe(`cancelled/${accepted.id}`)

    // Cascade complète : logement, couchages et demandes disparus
    const gone = await t.db.listing.findUnique({
      where: { id: listing.id },
      select: { id: true },
    })
    expect(gone).toBeNull()
    expect(await t.db.lodgingRequest.count({ where: { listingId: listing.id } })).toBe(0)
    expect(await t.db.listingBed.count({ where: { listingId: listing.id } })).toBe(0)
  })
})

/**
 * Intégration jumelage (écrans A.13-A.16) + admin (arbitrages 7 et 8 du plan v1).
 *
 * Jumelage : une seule annonce ACTIVE par unité (upsert), retrait = seule sortie,
 * ni refus ni expiration, « Ignorer » silencieux, multi-jumelage, et surtout :
 * les coordonnées (nom du responsable, e-mail, téléphone) ne circulent QUE sur les
 * mises en relation ACCEPTED — jamais sur les cartes publiques ni sur un PENDING.
 *
 * Admin : métriques par site, CRUD des logements institutionnels (HOTEL/COLLECTIVE),
 * suppression qui annule d'abord les demandes acceptées (demandeurs prévenus),
 * logements PRIVATE inaccessibles par ces routes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { contactLimiter } from '../../src/routes/jumelage'
import {
  extractToken,
  resetRateLimiters,
  sessionCookieOf,
  startTestEnv,
  type TestEnv,
} from '../helpers/testenv'

let t: TestEnv

// Fixtures (créées en beforeAll) — cookies de session logués une fois pour toute la suite.
const ids = {} as Record<'nancy' | 'woippy' | 'epinal' | 'segolene' | 'admin' | 'marie', string>
const cookies = {} as Record<'nancy' | 'woippy' | 'epinal' | 'segolene' | 'admin' | 'marie', string>

// État accumulé du scénario (les describes s'exécutent dans l'ordre de déclaration).
let nancyAdId: string
let woippyAdId: string
let epinalMetzAdId: string
let nancyContactId: string
let segoleneContactId: string
let hotelId: string
let gymId: string
let privateListingId: string

async function loginAs(email: string): Promise<string> {
  t.outbox.length = 0
  const res = await t.app.request('/api/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  expect(res.status).toBe(202)
  await vi.waitFor(() => expect(t.outbox.length).toBeGreaterThan(0))
  const lastEmail = t.outbox.at(-1)
  if (!lastEmail) throw new Error('outbox vide')
  const cb = await t.app.request(`/api/auth/callback?token=${extractToken(lastEmail)}`)
  return sessionCookieOf(cb)
}

async function req(
  method: string,
  path: string,
  cookie: string,
  json?: unknown,
): Promise<Response> {
  return t.app.request(`/api${path}`, {
    method,
    headers: {
      cookie,
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  })
}

async function errorCode(res: Response): Promise<string> {
  const body = (await res.json()) as { error: { code: string } }
  return body.error.code
}

beforeAll(async () => {
  t = await startTestEnv()

  const unit = (
    unitName: string,
    unitBranch: string,
    first: string,
    last: string,
    email: string,
    phone: string,
  ) =>
    t.db.user.create({
      data: {
        accountType: 'SCOUT_UNIT' as const,
        unitName,
        unitBranch,
        firstName: first,
        lastName: last,
        email,
        phone,
        onboardedAt: new Date(),
      },
      select: { id: true },
    })

  ids.nancy = (
    await unit(
      '1re Nancy',
      'Pionniers-Caravelles',
      'Nina',
      'Colin',
      'nancy@example.org',
      '+33611111111',
    )
  ).id
  ids.woippy = (
    await unit(
      '1re Woippy',
      'Scouts-Guides',
      'Paul',
      'Girard',
      'woippy@example.org',
      '+33622222222',
    )
  ).id
  ids.epinal = (
    await unit(
      '2e Épinal',
      'Scouts-Guides',
      'Lucas',
      'Perrin',
      'epinal@example.org',
      '+33633333333',
    )
  ).id
  ids.segolene = (
    await unit(
      'Groupe Sainte-Ségolène',
      'Louveteaux-Jeannettes',
      'Anne',
      'Petit',
      'segolene@example.org',
      '+33655555555',
    )
  ).id

  ids.admin = (
    await t.db.user.create({
      data: {
        accountType: 'INDIVIDUAL',
        role: 'ADMIN',
        firstName: 'Ana',
        lastName: 'Dupont',
        email: 'admin@example.org',
        phone: '+33600000009',
        onboardedAt: new Date(),
      },
      select: { id: true },
    })
  ).id
  ids.marie = (
    await t.db.user.create({
      data: {
        accountType: 'INDIVIDUAL',
        firstName: 'Marie',
        lastName: 'Lefèvre',
        email: 'marie@example.org',
        phone: '+33644444444',
        onboardedAt: new Date(),
      },
      select: { id: true },
    })
  ).id

  cookies.nancy = await loginAs('nancy@example.org')
  cookies.woippy = await loginAs('woippy@example.org')
  cookies.epinal = await loginAs('epinal@example.org')
  cookies.segolene = await loginAs('segolene@example.org')
  cookies.admin = await loginAs('admin@example.org')
  cookies.marie = await loginAs('marie@example.org')
})

beforeEach(async () => {
  await resetRateLimiters()
  contactLimiter.reset()
  // Throttle d'émission adossé à la base : table de tokens vidée entre les tests.
  await t.db.magicLinkToken.deleteMany({})
  t.outbox.length = 0
})

afterAll(async () => {
  await t.stop()
})

// ---------------------------------------------------------------------------
// Annonce — une seule ACTIVE par unité, retrait = seule sortie
// ---------------------------------------------------------------------------

describe('annonce de jumelage', () => {
  it('PUT publie notre annonce (ACTIVE, identité publique de l’unité)', async () => {
    const res = await req('PUT', '/my/jumelage/ad', cookies.nancy, {
      kind: 'SEEKING',
      site: 'metz',
      dateFrom: '2026-09-24',
      dateTo: '2026-09-29',
      peopleLabel: '18 jeunes + 3 chefs',
      description: 'Nous venons en train, projet de service commun.',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      kind: 'SEEKING',
      site: 'metz',
      status: 'ACTIVE',
      unitName: '1re Nancy',
      unitBranch: 'Pionniers-Caravelles',
      dateFrom: '2026-09-24',
      dateTo: '2026-09-29',
      peopleLabel: '18 jeunes + 3 chefs',
    })
    nancyAdId = body.id as string
  })

  it('le second PUT modifie LA même annonce — jamais deux ACTIVE (vérifié en base)', async () => {
    const res = await req('PUT', '/my/jumelage/ad', cookies.nancy, {
      kind: 'SEEKING',
      site: 'metz',
      dateFrom: '2026-09-25',
      dateTo: '2026-09-28',
      peopleLabel: '20 jeunes + 4 chefs',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; peopleLabel: string; description: null }
    expect(body.id).toBe(nancyAdId)
    expect(body.peopleLabel).toBe('20 jeunes + 4 chefs')
    expect(body.description).toBeNull()

    const rows = await t.db.jumelageAd.findMany({
      where: { userId: ids.nancy },
      select: { status: true },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('ACTIVE')
  })

  it('dates incohérentes → 400 VALIDATION_ERROR', async () => {
    const res = await req('PUT', '/my/jumelage/ad', cookies.nancy, {
      kind: 'SEEKING',
      site: 'metz',
      dateFrom: '2026-09-28',
      dateTo: '2026-09-25',
      peopleLabel: '20 jeunes',
    })
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('VALIDATION_ERROR')
  })

  it('withdraw → ad null dans /my/jumelage, annonce WITHDRAWN en base', async () => {
    const created = await req('PUT', '/my/jumelage/ad', cookies.epinal, {
      kind: 'SEEKING',
      site: 'metz',
      dateFrom: '2026-09-24',
      dateTo: '2026-09-29',
      peopleLabel: '16 personnes',
    })
    expect(created.status).toBe(200)
    epinalMetzAdId = ((await created.json()) as { id: string }).id

    const withdraw = await req('POST', '/my/jumelage/ad/withdraw', cookies.epinal)
    expect(withdraw.status).toBe(200)

    const my = await req('GET', '/my/jumelage', cookies.epinal)
    expect(((await my.json()) as { ad: unknown }).ad).toBeNull()

    const row = await t.db.jumelageAd.findUnique({
      where: { id: epinalMetzAdId },
      select: { status: true },
    })
    expect(row?.status).toBe('WITHDRAWN')
  })

  it('withdraw sans annonce active → 404', async () => {
    const res = await req('POST', '/my/jumelage/ad/withdraw', cookies.epinal)
    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('NOT_FOUND')
  })
})

// ---------------------------------------------------------------------------
// Liste publique — filtres, exclusions, minimisation des cartes
// ---------------------------------------------------------------------------

describe('liste publique des annonces', () => {
  it('filtre site + kind, exclut ma propre annonce et les annonces retirées', async () => {
    const woippyRes = await req('PUT', '/my/jumelage/ad', cookies.woippy, {
      kind: 'HOSTING',
      site: 'metz',
      dateFrom: '2026-09-24',
      dateTo: '2026-09-29',
      peopleLabel: 'jusqu’à 25 personnes',
      description: 'Local scout disponible, familles prêtes à accueillir.',
    })
    expect(woippyRes.status).toBe(200)
    woippyAdId = ((await woippyRes.json()) as { id: string }).id

    // Épinal repart sur Paris (son annonce metz a été retirée au describe précédent).
    const epinalRes = await req('PUT', '/my/jumelage/ad', cookies.epinal, {
      kind: 'SEEKING',
      site: 'paris',
      dateFrom: '2026-09-25',
      dateTo: '2026-09-28',
      peopleLabel: '16 personnes',
    })
    expect(epinalRes.status).toBe(200)

    // Nancy (SEEKING) voit l'annonce HOSTING de Woippy à Metz.
    const hosting = await req('GET', '/jumelage/ads?site=metz&kind=HOSTING', cookies.nancy)
    expect(hosting.status).toBe(200)
    const hostingBody = (await hosting.json()) as { items: { id: string }[]; total: number }
    expect(hostingBody.total).toBe(1)
    expect(hostingBody.items.map((a) => a.id)).toEqual([woippyAdId])

    // Woippy (HOSTING) voit l'annonce SEEKING de Nancy — l'annonce RETIRÉE
    // d'Épinal (metz, SEEKING) n'apparaît pas.
    const seeking = await req('GET', '/jumelage/ads?site=metz&kind=SEEKING', cookies.woippy)
    const seekingBody = (await seeking.json()) as { items: { id: string }[]; total: number }
    expect(seekingBody.items.map((a) => a.id)).toEqual([nancyAdId])

    // Nancy ne se voit pas elle-même dans la liste metz/SEEKING.
    const own = await req('GET', '/jumelage/ads?site=metz&kind=SEEKING', cookies.nancy)
    expect(((await own.json()) as { items: unknown[] }).items).toEqual([])

    // Filtre site seul.
    const paris = await req('GET', '/jumelage/ads?site=paris', cookies.nancy)
    const parisBody = (await paris.json()) as { items: { unitName: string }[] }
    expect(parisBody.items.map((a) => a.unitName)).toEqual(['2e Épinal'])
  })

  it('les cartes ne contiennent NI téléphone NI email (liste exhaustive des clés)', async () => {
    const res = await req('GET', '/jumelage/ads?site=metz&kind=HOSTING', cookies.nancy)
    const body = (await res.json()) as { items: Record<string, unknown>[] }
    expect(body.items).toHaveLength(1)
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual([
        'createdAt',
        'dateFrom',
        'dateTo',
        'description',
        'id',
        'kind',
        'peopleLabel',
        'site',
        'unitBranch',
        'unitName',
      ])
    }
    const raw = JSON.stringify(body)
    expect(raw).not.toContain('woippy@example.org')
    expect(raw).not.toContain('+33622222222')
    expect(raw).not.toContain('Girard')
  })

  it('fiche : ACTIVE visible par tous, WITHDRAWN → 404 sauf pour sa propre unité', async () => {
    const active = await req('GET', `/jumelage/ads/${woippyAdId}`, cookies.nancy)
    expect(active.status).toBe(200)
    expect(((await active.json()) as { unitName: string }).unitName).toBe('1re Woippy')

    const withdrawn = await req('GET', `/jumelage/ads/${epinalMetzAdId}`, cookies.nancy)
    expect(withdrawn.status).toBe(404)

    const own = await req('GET', `/jumelage/ads/${epinalMetzAdId}`, cookies.epinal)
    expect(own.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Contacts — création, doublon, garde-fous
// ---------------------------------------------------------------------------

describe('demande de mise en relation', () => {
  it('création → email au propriétaire (unité, effectif de NOTRE annonce, message — sans coordonnées)', async () => {
    const res = await req('POST', `/jumelage/ads/${woippyAdId}/contacts`, cookies.nancy, {
      message: 'Nous cherchons un point de chute à Metz.',
    })
    expect(res.status).toBe(201)

    await vi.waitFor(() => expect(t.outbox.length).toBe(1))
    const email = t.outbox[0]
    expect(email?.to).toBe('woippy@example.org')
    expect(email?.subject).toBe('Votre annonce de jumelage a une réponse')
    expect(email?.text).toContain('1re Nancy')
    // Le peopleLabel vient de l'annonce ACTIVE du demandeur (mise à jour par l'upsert).
    expect(email?.text).toContain('20 jeunes + 4 chefs')
    expect(email?.text).toContain('Nous cherchons un point de chute à Metz.')
    // Pas de coordonnées avant acceptation — l'email de contact n'en révèle aucune.
    expect(email?.text).not.toContain('nancy@example.org')
    expect(email?.text).not.toContain('+33611111111')
    expect(email?.idempotencyKey).toMatch(/^jumelage-contact\//)
  })

  it('doublon sur la même annonce → 409 « Demande déjà envoyée »', async () => {
    const res = await req('POST', `/jumelage/ads/${woippyAdId}/contacts`, cookies.nancy, {
      message: 'Deuxième tentative',
    })
    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('CONFLICT')
  })

  it('sur sa propre annonce → refus', async () => {
    const res = await req('POST', `/jumelage/ads/${woippyAdId}/contacts`, cookies.woippy, {})
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('VALIDATION_ERROR')
  })

  it('annonce inexistante → 404', async () => {
    const res = await req('POST', '/jumelage/ads/inconnu/contacts', cookies.nancy, {})
    expect(res.status).toBe(404)
  })

  it('un INDIVIDUAL est exclu de toutes les routes jumelage (403)', async () => {
    const list = await req('GET', '/jumelage/ads?site=metz', cookies.marie)
    expect(list.status).toBe(403)
    expect(await errorCode(list)).toBe('FORBIDDEN')

    const contact = await req('POST', `/jumelage/ads/${woippyAdId}/contacts`, cookies.marie, {
      message: 'coucou',
    })
    expect(contact.status).toBe(403)

    const ad = await req('PUT', '/my/jumelage/ad', cookies.marie, {
      kind: 'SEEKING',
      site: 'metz',
      dateFrom: '2026-09-24',
      dateTo: '2026-09-29',
      peopleLabel: '3 personnes',
    })
    expect(ad.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Acceptation — révélation mutuelle des coordonnées, multi-jumelage
// ---------------------------------------------------------------------------

describe('acceptation et mises en relation', () => {
  it('un contact PENDING ne révèle AUCUNE coordonnée (ni côté reçu, ni côté envoyé)', async () => {
    const my = await req('GET', '/my/jumelage', cookies.woippy)
    expect(my.status).toBe(200)
    const body = (await my.json()) as {
      received: Record<string, unknown>[]
      relations: unknown[]
      sentPending: unknown[]
    }
    expect(body.received).toHaveLength(1)
    const pending = body.received[0] as Record<string, unknown>
    expect(pending).toMatchObject({
      status: 'PENDING',
      unitName: '1re Nancy',
      unitBranch: 'Pionniers-Caravelles',
      // Effectif + dates courtes tirés de l'annonce ACTIVE du demandeur (A.16).
      peopleLabel: '20 jeunes + 4 chefs',
      dates: '25 → 28 sept.',
      message: 'Nous cherchons un point de chute à Metz.',
    })
    expect(pending).not.toHaveProperty('contact')
    const raw = JSON.stringify(pending)
    expect(raw).not.toContain('nancy@example.org')
    expect(raw).not.toContain('+33611111111')
    expect(raw).not.toContain('Colin')
    expect(body.relations).toEqual([])
    nancyContactId = pending.id as string

    // Côté demandeur : la demande envoyée liste l'unité cible, rien de plus.
    const nancyMy = await req('GET', '/my/jumelage', cookies.nancy)
    const nancyBody = (await nancyMy.json()) as { sentPending: Record<string, unknown>[] }
    expect(nancyBody.sentPending).toHaveLength(1)
    expect(nancyBody.sentPending[0]).toMatchObject({ adId: woippyAdId, unitName: '1re Woippy' })
    const sentRaw = JSON.stringify(nancyBody.sentPending)
    expect(sentRaw).not.toContain('woippy@example.org')
    expect(sentRaw).not.toContain('+33622222222')
  })

  it('accept → les DEUX unités reçoivent l’email avec les coordonnées de l’autre', async () => {
    const res = await req('POST', `/jumelage/contacts/${nancyContactId}/accept`, cookies.woippy)
    expect(res.status).toBe(200)

    await vi.waitFor(() => expect(t.outbox.length).toBe(2))
    const toWoippy = t.outbox.find((e) => e.to === 'woippy@example.org')
    const toNancy = t.outbox.find((e) => e.to === 'nancy@example.org')

    // Le propriétaire reçoit le contact du demandeur…
    expect(toWoippy?.subject).toBe(
      'Mise en relation acceptée — les coordonnées sont dans ce message',
    )
    expect(toWoippy?.text).toContain('Nina Colin')
    expect(toWoippy?.text).toContain('nancy@example.org')
    expect(toWoippy?.text).toContain('+33611111111')
    expect(toWoippy?.text).toContain('1re Nancy')

    // …et le demandeur celui du propriétaire.
    expect(toNancy?.text).toContain('Paul Girard')
    expect(toNancy?.text).toContain('woippy@example.org')
    expect(toNancy?.text).toContain('+33622222222')
    expect(toNancy?.text).toContain('1re Woippy')

    expect(toWoippy?.idempotencyKey).toBe(`jumelage-accepted/${nancyContactId}`)
    expect(toNancy?.idempotencyKey).toBe(`jumelage-accepted-b/${nancyContactId}`)

    // Les deux unités ont encore une annonce ACTIVE : chacune reçoit le lien
    // « Retirer notre annonce » vers la page relations (jamais de GET à effet de bord).
    expect(toWoippy?.text).toContain('Retirer notre annonce')
    expect(toWoippy?.text).toContain('/unite/relations')
    expect(toNancy?.text).toContain('Retirer notre annonce')
    expect(toNancy?.text).toContain('/unite/relations')
  })

  it('les relations exposent les coordonnées mutuelles DES DEUX CÔTÉS', async () => {
    // Côté propriétaire de l'annonce.
    const woippyMy = await req('GET', '/my/jumelage', cookies.woippy)
    const woippyBody = (await woippyMy.json()) as {
      received: ({ status: string } & Record<string, unknown>)[]
      relations: Record<string, unknown>[]
    }
    expect(woippyBody.relations).toHaveLength(1)
    expect(woippyBody.relations[0]).toMatchObject({
      unitName: '1re Nancy',
      unitBranch: 'Pionniers-Caravelles',
      contactName: 'Nina Colin',
      email: 'nancy@example.org',
      phone: '+33611111111',
    })
    // La demande acceptée reste dans Reçues, carte verte AVEC le contact (A.16).
    const accepted = woippyBody.received.find((r) => r.status === 'ACCEPTED')
    expect(accepted?.contact).toEqual({
      name: 'Nina Colin',
      email: 'nancy@example.org',
      phone: '+33611111111',
    })

    // Côté demandeur.
    const nancyMy = await req('GET', '/my/jumelage', cookies.nancy)
    const nancyBody = (await nancyMy.json()) as {
      relations: Record<string, unknown>[]
      sentPending: unknown[]
    }
    expect(nancyBody.relations).toHaveLength(1)
    expect(nancyBody.relations[0]).toMatchObject({
      unitName: '1re Woippy',
      unitBranch: 'Scouts-Guides',
      contactName: 'Paul Girard',
      email: 'woippy@example.org',
      phone: '+33622222222',
    })
    // Plus rien « en attente » côté envoyé une fois la demande acceptée.
    expect(nancyBody.sentPending).toEqual([])
  })

  it('ré-accepter la même demande → 409', async () => {
    const res = await req('POST', `/jumelage/contacts/${nancyContactId}/accept`, cookies.woippy)
    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('CONFLICT')
  })

  it('multi-jumelage : une deuxième demande acceptée sur la MÊME annonce', async () => {
    const create = await req('POST', `/jumelage/ads/${woippyAdId}/contacts`, cookies.epinal, {})
    expect(create.status).toBe(201)

    const my = await req('GET', '/my/jumelage', cookies.woippy)
    const received = (
      (await my.json()) as { received: { id: string; status: string; unitName: string }[] }
    ).received
    const epinalContact = received.find((r) => r.unitName === '2e Épinal' && r.status === 'PENDING')
    expect(epinalContact).toBeDefined()
    if (!epinalContact) throw new Error('contact Épinal introuvable')

    const accept = await req(
      'POST',
      `/jumelage/contacts/${epinalContact.id}/accept`,
      cookies.woippy,
    )
    expect(accept.status).toBe(200)

    const after = await req('GET', '/my/jumelage', cookies.woippy)
    const relations = ((await after.json()) as { relations: { unitName: string }[] }).relations
    expect(relations).toHaveLength(2)
    expect(relations.map((r) => r.unitName).sort()).toEqual(['1re Nancy', '2e Épinal'])
  })
})

// ---------------------------------------------------------------------------
// Ignorer — silencieux, non destructif, invisible pour le demandeur
// ---------------------------------------------------------------------------

describe('ignorer une demande', () => {
  it('dismiss : la carte disparaît des Reçues, AUCUN email, statut PENDING conservé en base', async () => {
    const create = await req('POST', `/jumelage/ads/${woippyAdId}/contacts`, cookies.segolene, {
      message: 'Nous pouvons donner un coup de main.',
    })
    expect(create.status).toBe(201)
    // L'email de contact part (Ségolène n'a pas d'annonce active → effectif « — »).
    await vi.waitFor(() => expect(t.outbox.length).toBe(1))
    expect(t.outbox[0]?.text).toContain('Groupe Sainte-Ségolène')
    expect(t.outbox[0]?.text).toContain('—')

    const my = await req('GET', '/my/jumelage', cookies.woippy)
    const received = (
      (await my.json()) as { received: { id: string; unitName: string; status: string }[] }
    ).received
    const segoleneContact = received.find((r) => r.unitName === 'Groupe Sainte-Ségolène')
    expect(segoleneContact?.status).toBe('PENDING')
    if (!segoleneContact) throw new Error('contact Ségolène introuvable')
    segoleneContactId = segoleneContact.id

    t.outbox.length = 0
    const dismiss = await req(
      'POST',
      `/jumelage/contacts/${segoleneContactId}/dismiss`,
      cookies.woippy,
    )
    expect(dismiss.status).toBe(200)

    // « Ignorer » est SILENCIEUX : aucune notification, à personne.
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(t.outbox).toHaveLength(0)

    // Disparue des Reçues (les mises en relation acceptées restent).
    const after = await req('GET', '/my/jumelage', cookies.woippy)
    const afterReceived = ((await after.json()) as { received: { unitName: string }[] }).received
    expect(afterReceived.map((r) => r.unitName).sort()).toEqual(['1re Nancy', '2e Épinal'])

    // Pas un refus : le statut reste PENDING, seul dismissedAt est posé.
    const row = await t.db.jumelageContact.findUnique({
      where: { id: segoleneContactId },
      select: { status: true, dismissedAt: true },
    })
    expect(row?.status).toBe('PENDING')
    expect(row?.dismissedAt).not.toBeNull()

    // Le demandeur ne voit AUCUNE différence : sa demande reste « envoyée, sans suite ».
    const segoleneMy = await req('GET', '/my/jumelage', cookies.segolene)
    const sentPending = ((await segoleneMy.json()) as { sentPending: { id: string }[] }).sentPending
    expect(sentPending.map((s) => s.id)).toContain(segoleneContactId)
  })

  it('un non-propriétaire ne peut ni accepter ni ignorer (404, pas de fuite)', async () => {
    const accept = await req(
      'POST',
      `/jumelage/contacts/${segoleneContactId}/accept`,
      cookies.nancy,
    )
    expect(accept.status).toBe(404)

    const dismiss = await req(
      'POST',
      `/jumelage/contacts/${segoleneContactId}/dismiss`,
      cookies.nancy,
    )
    expect(dismiss.status).toBe(404)

    // Rien n'a bougé côté propriétaire réel.
    const row = await t.db.jumelageContact.findUnique({
      where: { id: segoleneContactId },
      select: { status: true },
    })
    expect(row?.status).toBe('PENDING')
  })
})

// ---------------------------------------------------------------------------
// Admin — CRUD institutionnel + métriques
// ---------------------------------------------------------------------------

const hotelBody = {
  category: 'HOTEL',
  site: 'paris',
  title: 'Hôtel Ibis Nation · chambres',
  description: 'Tarif négocié pour les volontaires et participants.',
  address: {
    label: '18 avenue du Trône, 75012 Paris',
    city: 'Paris',
    postcode: '75012',
    lat: 48.848,
    lng: 2.395,
  },
  capacity: 40,
  priceInfo: '45 € · code PAPE15',
  bookingUrl: 'https://hotel.example.com/pape',
  availableFrom: '2026-09-24',
  availableTo: '2026-09-29',
  access: {
    pmr: true,
    electricWheelchair: false,
    fewSteps: true,
    humanHelp: false,
    transport: true,
    parking: false,
    assistanceDog: true,
    quiet: false,
  },
}

const gymBody = {
  category: 'COLLECTIVE',
  site: 'paris',
  title: 'Gymnase Léo-Lagrange',
  description: 'Couchage collectif au sol, prévoir matelas et duvet.',
  address: {
    label: '67 rue Petit, 75019 Paris',
    city: 'Paris',
    postcode: '75019',
    lat: 48.883,
    lng: 2.388,
  },
  capacity: 80,
  priceInfo: '5 € / nuit',
  availableFrom: '2026-09-25',
  availableTo: '2026-09-28',
  access: {
    pmr: true,
    electricWheelchair: true,
    fewSteps: true,
    humanHelp: false,
    transport: true,
    parking: true,
    assistanceDog: false,
    quiet: false,
  },
}

describe('admin', () => {
  it('un USER (même unité) n’accède à aucune route /admin/* (403)', async () => {
    const metrics = await req('GET', '/admin/metrics', cookies.marie)
    expect(metrics.status).toBe(403)
    expect(await errorCode(metrics)).toBe('FORBIDDEN')

    const create = await req('POST', '/admin/listings', cookies.marie, hotelBody)
    expect(create.status).toBe(403)

    const unitList = await req('GET', '/admin/listings', cookies.nancy)
    expect(unitList.status).toBe(403)
  })

  it('création d’un hôtel : fiche prix + bouton de réservation externe', async () => {
    const res = await req('POST', '/admin/listings', cookies.admin, hotelBody)
    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      category: 'HOTEL',
      site: 'paris',
      title: 'Hôtel Ibis Nation · chambres',
      displayArea: 'Paris 12e', // dérivée du code postal BAN
      capacity: 40,
      priceInfo: '45 € · code PAPE15',
      bookingUrl: 'https://hotel.example.com/pape',
      addressFull: '18 avenue du Trône, 75012 Paris',
      hostDisplayName: null,
      beds: [],
      bedTypes: [],
      status: 'OPEN',
      pendingRequests: 0,
      bookingClicks: 0,
    })
    expect(typeof body.distanceKm).toBe('number')
    hotelId = body.id as string
  })

  it('création d’un gymnase (COLLECTIVE, flux de demande standard)', async () => {
    const res = await req('POST', '/admin/listings', cookies.admin, gymBody)
    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      category: 'COLLECTIVE',
      title: 'Gymnase Léo-Lagrange',
      displayArea: 'Paris 19e',
      capacity: 80,
      priceInfo: '5 € / nuit',
      bookingUrl: null,
    })
    gymId = body.id as string
  })

  it('GET /admin/listings liste les institutionnels (vue propriétaire, adresse incluse)', async () => {
    const res = await req('GET', '/admin/listings', cookies.admin)
    expect(res.status).toBe(200)
    const items = ((await res.json()) as { items: { id: string; addressFull: string }[] }).items
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.id).sort()).toEqual([hotelId, gymId].sort())
    for (const item of items) {
      expect(item.addressFull.length).toBeGreaterThan(0)
    }
  })

  it('clics sur le lien de réservation : comptés côté volontaire, visibles côté admin', async () => {
    // Deux clics d'un volontaire (double-clic, retour sur la fiche…) : chacun compte.
    for (let i = 0; i < 2; i++) {
      const click = await req('POST', `/listings/${hotelId}/booking-click`, cookies.marie)
      expect(click.status).toBe(200)
    }

    // Le gymnase n'a pas de lien de réservation : la route n'existe pas pour lui.
    const gymClick = await req('POST', `/listings/${gymId}/booking-click`, cookies.marie)
    expect(gymClick.status).toBe(404)

    const res = await req('GET', '/admin/listings', cookies.admin)
    expect(res.status).toBe(200)
    const items = ((await res.json()) as { items: { id: string; bookingClicks: number }[] }).items
    expect(items.find((i) => i.id === hotelId)?.bookingClicks).toBe(2)
    expect(items.find((i) => i.id === gymId)?.bookingClicks).toBe(0)
  })

  it('PATCH remplace la fiche (corps complet)', async () => {
    const res = await req('PATCH', `/admin/listings/${hotelId}`, cookies.admin, {
      ...hotelBody,
      capacity: 45,
      priceInfo: '39 € · code PAPE15',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { capacity: number; priceInfo: string }
    expect(body.capacity).toBe(45)
    expect(body.priceInfo).toBe('39 € · code PAPE15')
  })

  it('un logement PRIVATE n’est ni éditable ni supprimable via /admin/listings (404)', async () => {
    privateListingId = (
      await t.db.listing.create({
        data: {
          ownerId: ids.marie,
          category: 'PRIVATE',
          site: 'paris',
          addressFull: '3 rue des Lilas, 75020 Paris',
          displayArea: 'Paris 20e',
          availableFrom: new Date('2026-09-24'),
          availableTo: new Date('2026-09-29'),
          capacity: 3,
        },
        select: { id: true },
      })
    ).id

    const patch = await req('PATCH', `/admin/listings/${privateListingId}`, cookies.admin, gymBody)
    expect(patch.status).toBe(404)

    const del = await req('DELETE', `/admin/listings/${privateListingId}`, cookies.admin)
    expect(del.status).toBe(404)

    const still = await t.db.listing.findUnique({
      where: { id: privateListingId },
      select: { category: true },
    })
    expect(still?.category).toBe('PRIVATE')
  })

  it('DELETE d’un gymnase : les demandes acceptées sont annulées et les demandeurs prévenus', async () => {
    const request = await t.db.lodgingRequest.create({
      data: {
        listingId: gymId,
        requesterId: ids.marie,
        dateFrom: new Date('2026-09-25'),
        dateTo: new Date('2026-09-28'),
        peopleCount: 30,
        status: 'ACCEPTED',
        awaitingSide: 'HOST',
      },
      select: { id: true },
    })

    const res = await req('DELETE', `/admin/listings/${gymId}`, cookies.admin)
    expect(res.status).toBe(200)

    // Le demandeur est prévenu de l'annulation (transition CANCELLED effectuée
    // AVANT la suppression — la ligne part ensuite avec la cascade du listing,
    // même sémantique que deleteUserAccount).
    await vi.waitFor(() => expect(t.outbox.length).toBe(1))
    const email = t.outbox[0]
    expect(email?.to).toBe('marie@example.org')
    expect(email?.subject).toBe('Demande annulée — Gymnase Léo-Lagrange')
    expect(email?.text).toContain("l'hébergeur")
    expect(email?.idempotencyKey).toBe(`cancelled/${request.id}`)

    expect(await t.db.listing.findUnique({ where: { id: gymId } })).toBeNull()
    expect(await t.db.lodgingRequest.findUnique({ where: { id: request.id } })).toBeNull()
  })

  it('métriques exactes par site, cohérentes avec les fixtures', async () => {
    // Fixtures dédiées sur Lourdes (site vierge jusqu'ici) — posées en direct via t.db.
    const listing = (data: {
      ownerId: string
      category: 'PRIVATE' | 'HOTEL' | 'COLLECTIVE'
      capacity: number
      hiddenAt?: Date
      title?: string
    }) =>
      t.db.listing.create({
        data: {
          site: 'lourdes',
          addressFull: '2 rue du Bourg, 65100 Lourdes',
          displayArea: 'Lourdes',
          availableFrom: new Date('2026-09-24'),
          availableTo: new Date('2026-09-29'),
          ...data,
        },
        select: { id: true },
      })

    const privActive = await listing({ ownerId: ids.marie, category: 'PRIVATE', capacity: 8 })
    const privHidden = await listing({
      ownerId: ids.marie,
      category: 'PRIVATE',
      capacity: 4,
      hiddenAt: new Date(),
    })
    await listing({
      ownerId: ids.admin,
      category: 'HOTEL',
      capacity: 40,
      title: 'Hôtel des Sanctuaires',
    })
    await listing({
      ownerId: ids.admin,
      category: 'COLLECTIVE',
      capacity: 60,
      title: 'Gymnase de Lourdes',
    })

    const lodging = (listingId: string, status: 'PENDING' | 'ACCEPTED' | 'CANCELLED') =>
      t.db.lodgingRequest.create({
        data: {
          listingId,
          requesterId: ids.marie,
          dateFrom: new Date('2026-09-25'),
          dateTo: new Date('2026-09-28'),
          peopleCount: 3,
          status,
          awaitingSide: 'HOST',
          ...(status === 'CANCELLED' ? { cancelledBy: 'SYSTEM' as const } : {}),
        },
        select: { id: true },
      })
    await lodging(privActive.id, 'PENDING')
    await lodging(privHidden.id, 'ACCEPTED')
    await lodging(privActive.id, 'CANCELLED')

    // Jumelage à Lourdes : une unité qui accueille, Ségolène qui cherche, 1 relation.
    const lourdesUnitId = (
      await t.db.user.create({
        data: {
          accountType: 'SCOUT_UNIT',
          unitName: '1re Lourdes',
          unitBranch: 'Compagnons',
          firstName: 'Léa',
          lastName: 'Fabre',
          email: 'lourdes-unit@example.org',
          phone: '+33666666666',
          onboardedAt: new Date(),
        },
        select: { id: true },
      })
    ).id
    const hostingAd = await t.db.jumelageAd.create({
      data: {
        userId: lourdesUnitId,
        kind: 'HOSTING',
        site: 'lourdes',
        dateFrom: new Date('2026-09-24'),
        dateTo: new Date('2026-09-29'),
        peopleLabel: '30 personnes',
      },
      select: { id: true },
    })
    await t.db.jumelageAd.create({
      data: {
        userId: ids.segolene,
        kind: 'SEEKING',
        site: 'lourdes',
        dateFrom: new Date('2026-09-25'),
        dateTo: new Date('2026-09-28'),
        peopleLabel: '12 personnes',
      },
      select: { id: true },
    })
    await t.db.jumelageContact.create({
      data: {
        adId: hostingAd.id,
        requesterId: ids.segolene,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
      select: { id: true },
    })

    const res = await req('GET', '/admin/metrics', cookies.admin)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      sites: ({ site: string } & Record<string, unknown>)[]
      users: Record<string, number>
    }

    // Les sites sortent dans l'ordre de la config événement.
    expect(body.sites.map((s) => s.site)).toEqual(['lourdes', 'paris', 'metz'])

    const lourdes = body.sites.find((s) => s.site === 'lourdes')
    expect(lourdes).toMatchObject({
      listings: {
        privateActive: 1,
        privateHidden: 1,
        hotel: 1,
        collective: 1,
        // Capacité des non-masqués : 8 (privé actif) + 40 (hôtel) + 60 (gymnase).
        totalCapacity: 108,
      },
      requests: { pending: 1, accepted: 1, declined: 0, expired: 0, cancelled: 1 },
      jumelage: { seeking: 1, hosting: 1, relations: 1 },
    })

    // Metz : les annonces actives de Nancy (SEEKING) et Woippy (HOSTING) ; deux
    // relations acceptées sur l'annonce Woippy ; le PENDING ignoré ne compte pas.
    const metz = body.sites.find((s) => s.site === 'metz')
    expect(metz).toMatchObject({
      listings: { privateActive: 0, privateHidden: 0, hotel: 0, collective: 0, totalCapacity: 0 },
      requests: { pending: 0, accepted: 0, declined: 0, expired: 0, cancelled: 0 },
      jumelage: { seeking: 1, hosting: 1, relations: 2 },
    })

    // Paris : l'hôtel (le gymnase a été supprimé, sa demande avec lui), le logement
    // PRIVATE témoin, l'annonce SEEKING d'Épinal. Capacité : 3 (privé) + 45 (hôtel PATCHé).
    const paris = body.sites.find((s) => s.site === 'paris')
    expect(paris).toMatchObject({
      listings: { privateActive: 1, privateHidden: 0, hotel: 1, collective: 0, totalCapacity: 48 },
      requests: { pending: 0, accepted: 0, declined: 0, expired: 0, cancelled: 0 },
      jumelage: { seeking: 1, hosting: 0, relations: 0 },
    })

    // Comptes : 2 individuels (Marie, l'admin), 5 unités, aucune coquille.
    expect(body.users).toEqual({ individuals: 2, units: 5, shells: 0 })
  })
})

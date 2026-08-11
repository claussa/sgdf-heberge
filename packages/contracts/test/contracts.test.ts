import { describe, expect, it } from 'vitest'
import {
  AdminListingUpsertSchema,
  ListingCardSchema,
  ListingSearchQuerySchema,
  MagicLinkRequestSchema,
  OnboardingSchema,
  RequestCreateSchema,
  RequestRequesterViewSchema,
  SiteSchema,
} from '../src/index'

const accessGrid = {
  pmr: false,
  electricWheelchair: false,
  fewSteps: false,
  humanHelp: false,
  transport: false,
  parking: false,
  assistanceDog: false,
  quiet: false,
}

describe('SiteSchema (dérivé de @repo/event-config)', () => {
  it('accepte les slugs configurés et refuse le reste', () => {
    expect(SiteSchema.parse('paris')).toBe('paris')
    expect(SiteSchema.parse('lourdes')).toBe('lourdes')
    expect(() => SiteSchema.parse('marseille')).toThrow()
  })
})

describe('minimisation : les schémas de réponse strippent les champs non déclarés', () => {
  it('ListingCardSchema ne laisse jamais passer une adresse ou un téléphone', () => {
    const card = ListingCardSchema.parse({
      id: 'l1',
      category: 'PRIVATE',
      site: 'paris',
      title: 'Chambre privée · 2 places',
      displayArea: 'Paris 12e',
      distanceKm: 2.1,
      capacity: 8,
      availableFrom: '2026-09-24',
      availableTo: '2026-09-29',
      access: accessGrid,
      parkingEase: null,
      bedTypes: ['PRIVATE_ROOM'],
      priceInfo: null,
      // champs interdits injectés volontairement :
      addressFull: '12 rue des Boulets, 75012 Paris',
      phone: '06 12 34 56 78',
      emailHash: 'x',
    })
    expect(card).not.toHaveProperty('addressFull')
    expect(card).not.toHaveProperty('phone')
    expect(card).not.toHaveProperty('emailHash')
  })

  it('vue demandeur : hostContact accepté uniquement sur une demande ACCEPTED', () => {
    const base = {
      id: 'r1',
      dateFrom: '2026-09-25',
      dateTo: '2026-09-28',
      peopleCount: 3,
      status: 'PENDING',
      awaitingSide: 'HOST',
      lastActivityAt: '2026-08-01T10:00:00.000Z',
      expiresAt: '2026-08-08T10:00:00.000Z',
      createdAt: '2026-08-01T10:00:00.000Z',
      messages: [],
      listing: {
        id: 'l1',
        title: 'Chambre privée · 2 places',
        displayArea: 'Paris 12e',
        site: 'paris',
        category: 'PRIVATE',
      },
      hostDisplayName: 'Claire M.',
    }
    const pending = RequestRequesterViewSchema.parse({
      ...base,
      effectiveStatus: 'PENDING',
      // coordonnées injectées sur une demande NON acceptée → strippées
      hostContact: { firstName: 'C', lastName: 'M', phone: 'x', email: 'c@x.fr', addressFull: 'y' },
    })
    expect(pending).not.toHaveProperty('hostContact')

    const accepted = RequestRequesterViewSchema.parse({
      ...base,
      status: 'ACCEPTED',
      effectiveStatus: 'ACCEPTED',
      hostContact: {
        firstName: 'Claire',
        lastName: 'Martin',
        phone: '06 12 34 56 78',
        email: 'claire@exemple.fr',
        addressFull: '12 rue des Boulets, 75012 Paris',
      },
    })
    expect(accepted).toHaveProperty('hostContact')
  })
})

describe('requêtes', () => {
  it('valide un email et refuse le reste', () => {
    expect(MagicLinkRequestSchema.parse({ email: 'a@b.fr' }).email).toBe('a@b.fr')
    expect(() => MagicLinkRequestSchema.parse({ email: 'pas-un-email' })).toThrow()
  })

  it('onboarding : union discriminée par accountType', () => {
    const indiv = OnboardingSchema.parse({
      accountType: 'INDIVIDUAL',
      firstName: 'Marie',
      lastName: 'Lefèvre',
      phone: '06 98 76 54 32',
      groupSize: 3,
      accessibilityNeeds: ['pmr'],
    })
    expect(indiv.accountType).toBe('INDIVIDUAL')

    const unit = OnboardingSchema.parse({
      accountType: 'SCOUT_UNIT',
      unitName: '1re Nancy',
      unitBranch: 'Pionniers-Caravelles',
      firstName: 'Nina',
      lastName: 'Colin',
      phone: '06 77 88 99 00',
    })
    expect(unit.accountType).toBe('SCOUT_UNIT')

    // une unité sans nom d'unité est invalide
    expect(() =>
      OnboardingSchema.parse({
        accountType: 'SCOUT_UNIT',
        firstName: 'Nina',
        lastName: 'Colin',
        phone: '06 77 88 99 00',
      }),
    ).toThrow()
  })

  it('recherche : défauts de pagination, coercition, tableaux depuis la query string', () => {
    const q = ListingSearchQuerySchema.parse({ site: 'paris' })
    expect(q.page).toBe(1)
    expect(q.pageSize).toBe(24)

    const q2 = ListingSearchQuerySchema.parse({
      site: 'metz',
      people: '3',
      types: 'COUCH',
      access: ['pmr', 'quiet'],
    })
    expect(q2.people).toBe(3)
    expect(q2.types).toEqual(['COUCH'])
    expect(q2.access).toEqual(['pmr', 'quiet'])
  })

  it('création de demande : bornes de peopleCount et message obligatoire', () => {
    expect(() =>
      RequestCreateSchema.parse({
        dateFrom: '2026-09-25',
        dateTo: '2026-09-28',
        peopleCount: 0,
        message: 'x',
      }),
    ).toThrow()
    expect(() =>
      RequestCreateSchema.parse({
        dateFrom: '2026-09-25',
        dateTo: '2026-09-28',
        peopleCount: 2,
        message: '',
      }),
    ).toThrow()
  })

  it('admin : un logement institutionnel exige une catégorie non PRIVATE', () => {
    expect(() =>
      AdminListingUpsertSchema.parse({
        category: 'PRIVATE',
        site: 'paris',
        title: 'Gymnase',
        address: {
          label: '68 bd Poniatowski, 75012 Paris',
          city: 'Paris',
          postcode: '75012',
          lat: 48.8,
          lng: 2.4,
        },
        capacity: 120,
        availableFrom: '2026-09-24',
        availableTo: '2026-09-29',
        access: accessGrid,
      }),
    ).toThrow()
  })
})

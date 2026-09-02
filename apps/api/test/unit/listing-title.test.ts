import type { BedType } from '@repo/db'
import { describe, expect, it } from 'vitest'
import {
  availableBeds,
  listingCardTitle,
  listingOwnerTitle,
  rankedBedTypes,
} from '../../src/services/listing-title'

interface Bed {
  type: BedType
  count: number
  capacityEach: number
}

/** 2×2 + 1×2 + 2×1 = 8 places, trois types */
const BEDS: Bed[] = [
  { type: 'COUCH', count: 1, capacityEach: 2 },
  { type: 'PRIVATE_ROOM', count: 2, capacityEach: 2 },
  { type: 'FLOOR_BED', count: 2, capacityEach: 1 },
]

describe('listingCardTitle (carte, fiche, emails au demandeur)', () => {
  it('particulier : « Chez {prénom} · n places » — places restantes, sans type de couchage', () => {
    const title = listingCardTitle({
      category: 'PRIVATE',
      title: null,
      availableCapacity: 6,
      owner: { firstName: 'Claire' },
    })
    expect(title).toBe('Chez Claire · 6 places')
  })

  it('singulier à 1 place, « Logement » sans prénom, « complet » à 0', () => {
    expect(
      listingCardTitle({
        category: 'PRIVATE',
        title: null,
        availableCapacity: 1,
        owner: { firstName: null },
      }),
    ).toBe('Logement · 1 place')
    expect(
      listingCardTitle({
        category: 'PRIVATE',
        title: null,
        availableCapacity: 0,
        owner: { firstName: 'Claire' },
      }),
    ).toBe('Chez Claire · complet')
  })

  it('institutionnel : le titre saisi par l’admin, « Hébergement » à défaut', () => {
    const owner = { firstName: 'Admin' }
    expect(
      listingCardTitle({
        category: 'HOTEL',
        title: 'Hôtel Ibis Nation',
        availableCapacity: 30,
        owner,
      }),
    ).toBe('Hôtel Ibis Nation')
    expect(
      listingCardTitle({ category: 'COLLECTIVE', title: null, availableCapacity: 60, owner }),
    ).toBe('Hébergement')
  })
})

describe('availableBeds (ce que voit un demandeur)', () => {
  it('retire les lignes entièrement occupées et ramène count aux couchages restants', () => {
    const beds = [
      { type: 'PRIVATE_ROOM', count: 2, capacityEach: 2, takenCount: 1, note: 'étage' },
      { type: 'COUCH', count: 1, capacityEach: 2, takenCount: 1, note: null },
      { type: 'FLOOR_BED', count: 2, capacityEach: 1, takenCount: 0, note: null },
    ] as const
    expect(availableBeds([...beds])).toEqual([
      { type: 'PRIVATE_ROOM', count: 1, capacityEach: 2, takenCount: 1, note: 'étage' },
      { type: 'FLOOR_BED', count: 2, capacityEach: 1, takenCount: 0, note: null },
    ])
    // Le classement des types suit les places restantes : la chambre (2) passe derrière les couchages (2), ordre du select
    expect(rankedBedTypes(availableBeds([...beds]))).toEqual(['PRIVATE_ROOM', 'FLOOR_BED'])
  })
})

describe('rankedBedTypes (icône + ligne de types de la carte)', () => {
  it('du plus grand au plus petit, égalité départagée par l’ordre du select', () => {
    // PRIVATE_ROOM 4 places ; COUCH et FLOOR_BED 2 places chacun → ordre du select
    expect(rankedBedTypes(BEDS)).toEqual(['PRIVATE_ROOM', 'COUCH', 'FLOOR_BED'])
  })

  it('cumule les lignes d’un même type, sans doublon', () => {
    const beds: Bed[] = [
      { type: 'PRIVATE_ROOM', count: 1, capacityEach: 3 },
      { type: 'COUCH', count: 1, capacityEach: 2 },
      { type: 'COUCH', count: 1, capacityEach: 2 },
    ]
    expect(rankedBedTypes(beds)).toEqual(['COUCH', 'PRIVATE_ROOM'])
    expect(rankedBedTypes([])).toEqual([])
  })
})

describe('listingOwnerTitle (vue hébergeur)', () => {
  it('énumère les couchages : « Chez Claire — 1 canapé, 2 chambres privées, … »', () => {
    expect(
      listingOwnerTitle({ category: 'PRIVATE', title: null, beds: BEDS, ownerFirstName: 'Claire' }),
    ).toBe('Chez Claire — 1 canapé, 2 chambres privées, 2 couchages sommaires')
  })
})

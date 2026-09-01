import type { BedType } from '@repo/db'
import { describe, expect, it } from 'vitest'
import {
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
  it('particulier : « Chez {prénom} · n places », sans type de couchage', () => {
    const title = listingCardTitle({
      category: 'PRIVATE',
      title: null,
      capacity: 8,
      owner: { firstName: 'Claire' },
    })
    expect(title).toBe('Chez Claire · 8 places')
  })

  it('singulier à 1 place, « Logement » sans prénom', () => {
    expect(
      listingCardTitle({
        category: 'PRIVATE',
        title: null,
        capacity: 1,
        owner: { firstName: null },
      }),
    ).toBe('Logement · 1 place')
  })

  it('institutionnel : le titre saisi par l’admin, « Hébergement » à défaut', () => {
    const owner = { firstName: 'Admin' }
    expect(
      listingCardTitle({ category: 'HOTEL', title: 'Hôtel Ibis Nation', capacity: 30, owner }),
    ).toBe('Hôtel Ibis Nation')
    expect(listingCardTitle({ category: 'COLLECTIVE', title: null, capacity: 60, owner })).toBe(
      'Hébergement',
    )
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

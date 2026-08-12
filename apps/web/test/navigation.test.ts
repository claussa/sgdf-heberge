import type { Me } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
import { buildNav } from '../src/layout/navigation'

/**
 * Ancrage du bug de fusion de nav : un hébergeur pur (parcours « Je propose un
 * logement », espace recherche jamais activé) voyait la nav volontaire, puis les
 * deux navs après création de son premier logement. B.9 : navs distinctes.
 */

function me(overrides: Partial<Me>): Me {
  return {
    id: 'u1',
    accountType: 'INDIVIDUAL',
    role: 'USER',
    email: 'test@exemple.fr',
    firstName: 'Test',
    lastName: 'Testeur',
    phone: '06 00 00 00 00',
    groupSize: null,
    accessibilityNeeds: [],
    unitName: null,
    unitBranch: null,
    onboardedAt: '2026-08-01T00:00:00.000Z',
    hasListings: false,
    seeksAccommodation: false,
    hostTourStatus: null,
    hasActiveAd: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const labels = (items: ReturnType<typeof buildNav>) => items.map((item) => item.label)

describe('buildNav — comptes INDIVIDUAL', () => {
  it('hébergeur pur sans logement (création du 1er en cours) : nav hébergeur seule', () => {
    const items = buildNav(me({}))
    expect(labels(items)).toEqual(['Demandes reçues', 'Mes logements', 'Mon profil'])
  })

  it('hébergeur pur avec logement : nav hébergeur seule, profil vers /hebergeur', () => {
    const items = buildNav(me({ hasListings: true }))
    expect(labels(items)).toEqual(['Demandes reçues', 'Mes logements', 'Mon profil'])
    expect(items.at(-1)?.to).toBe('/hebergeur')
    // Libellé court mobile : pas de désambiguïsation « Reçues » nécessaire sans « Mes demandes »
    expect(items[0]?.short).toBe('Demandes')
  })

  it('volontaire pur : nav volontaire seule, profil vers /profil', () => {
    const items = buildNav(me({ seeksAccommodation: true }))
    expect(labels(items)).toEqual(['Rechercher un logement', 'Mes demandes', 'Mon profil'])
    expect(items.at(-1)?.to).toBe('/profil')
  })

  it('volontaire qui héberge aussi : les deux espaces fusionnés', () => {
    const items = buildNav(me({ seeksAccommodation: true, hasListings: true }))
    expect(labels(items)).toEqual([
      'Rechercher un logement',
      'Mes demandes',
      'Demandes reçues',
      'Mes logements',
      'Mon profil',
    ])
    expect(items.at(-1)?.to).toBe('/profil')
    expect(items[2]?.short).toBe('Reçues')
  })

  it('pas onboardé ou anonyme : aucune nav', () => {
    expect(buildNav(null)).toEqual([])
    expect(buildNav(me({ accountType: null }))).toEqual([])
  })
})

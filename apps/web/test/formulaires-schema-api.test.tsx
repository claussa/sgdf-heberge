import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AccessGrid, ListingDetail, Me } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HebergeurLogementNouveau } from '../src/pages/HebergeurLogementNouveau'
import { Logement } from '../src/pages/Logement'
import { ProfilVolontaire } from '../src/pages/ProfilVolontaire'

/** Ces tests visent ce que `min`/`max`/`required` ne peuvent pas attraper côté navigateur. */

const GRILLE_VIDE: AccessGrid = {
  pmr: false,
  electricWheelchair: false,
  fewSteps: false,
  humanHelp: false,
  transport: false,
  parking: false,
  assistanceDog: false,
  quiet: false,
}

const ME: Me = {
  id: 'user-1',
  accountType: 'INDIVIDUAL',
  role: 'USER',
  email: 'claire@example.org',
  firstName: 'Claire',
  lastName: 'Martin',
  phone: '0600000000',
  groupSize: 2,
  accessibilityNeeds: [],
  unitName: null,
  unitBranch: null,
  onboardedAt: '2026-08-01T10:00:00.000Z',
  hasListings: false,
  seeksAccommodation: true,
  hostTourStatus: null,
  seekerTourStatus: 'DONE',
  unitTourStatus: null,
  hasActiveAd: false,
  createdAt: '2026-08-01T10:00:00.000Z',
}

const FICHE: ListingDetail = {
  id: 'log-1',
  category: 'COLLECTIVE',
  site: 'lourdes',
  title: 'Gymnase · 80 places',
  displayArea: 'Lourdes centre',
  distanceKm: 1.2,
  capacity: 80,
  availableFrom: '2026-09-25',
  availableTo: '2026-09-28',
  access: GRILLE_VIDE,
  parkingEase: null,
  bedTypes: ['FLOOR_BED'],
  priceInfo: null,
  description: null,
  accessibilityNotes: null,
  hostDisplayName: null,
  beds: [{ type: 'FLOOR_BED', count: 80, capacityEach: 1, note: null }],
  bookingUrl: null,
}

/** Toute écriture est mémorisée : les tests vérifient qu'il n'en part aucune. */
let ecritures: string[] = []
const fetchMock = vi.fn(async (input: unknown, init?: { method?: string }) => {
  const url = String(input)
  const method = init?.method ?? 'GET'
  if (method !== 'GET') {
    ecritures.push(`${method} ${url}`)
    return { status: 201, json: async () => ({}) }
  }
  if (url.startsWith('/api/me')) return { status: 200, json: async () => ME }
  if (url.startsWith('/api/my/listings')) return { status: 200, json: async () => [] }
  if (url.startsWith('/api/listings/')) return { status: 200, json: async () => FICHE }
  throw new Error(`fetch inattendu : ${url}`)
})

function rendre(entree: string, chemin: string, element: React.ReactElement) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[entree]}>
        <Routes>
          <Route path={chemin} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  ecritures = []
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Demande d’hébergement — la saisie est jugée par RequestCreateSchema', () => {
  it('un message blanc passe `required` mais pas le schéma : rien n’est envoyé', async () => {
    rendre('/logements/log-1', '/logements/:id', <Logement />)
    await screen.findByRole('button', { name: /Envoyer ma demande/ })

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /Envoyer ma demande/ }))

    expect(await screen.findByText(/Écris un message/i)).toBeTruthy()
    expect(ecritures).toEqual([])
  })

  it('une saisie valide part bien vers l’API', async () => {
    rendre('/logements/log-1', '/logements/:id', <Logement />)
    await screen.findByRole('button', { name: /Envoyer ma demande/ })

    fireEvent.change(screen.getByLabelText('Nombre de personnes'), { target: { value: '4' } })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Bonjour !' } })
    fireEvent.click(screen.getByRole('button', { name: /Envoyer ma demande/ }))

    await waitFor(() => expect(ecritures).toEqual(['POST /api/listings/log-1/requests']))
  })

  it('aucune erreur affichée avant la première tentative d’envoi', async () => {
    rendre('/logements/log-1', '/logements/:id', <Logement />)
    await screen.findByRole('button', { name: /Envoyer ma demande/ })

    expect(screen.queryByText(/nombre de personnes entre/i)).toBeNull()
    expect(screen.queryByText(/Écris un message/i)).toBeNull()
  })
})

describe('Logement hébergeur — les couchages sont jugés par ListingUpsertSchema', () => {
  it('tableau vidé : `beds.min(1)` bloque l’étape 2, sans validation native pour le voir', async () => {
    rendre(
      '/hebergeur/logements/nouveau',
      '/hebergeur/logements/nouveau',
      <HebergeurLogementNouveau />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Retirer' }))
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))

    expect(await screen.findByText(/Ajoute au moins un couchage/i)).toBeTruthy()
    expect(ecritures).toEqual([])
  })
})

describe('Profil volontaire — la saisie est jugée par le schéma de l’onboarding / mise à jour', () => {
  it('un prénom trop long n’a aucun attribut pour le bloquer : c’est le schéma qui l’arrête', async () => {
    rendre('/profil', '/profil', <ProfilVolontaire />)
    await screen.findByRole('button', { name: /Enregistrer et rechercher/ })

    // Prénom/nom n'ont pas de `maxLength` : rien côté navigateur ne voit le `max(100)`.
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'a'.repeat(101) } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer et rechercher/ }))

    expect(await screen.findByText(/Vérifie les informations saisies/i)).toBeTruthy()
    expect(ecritures).toEqual([])
  })

  it('un profil valide part bien vers l’API', async () => {
    rendre('/profil', '/profil', <ProfilVolontaire />)
    await screen.findByRole('button', { name: /Enregistrer et rechercher/ })

    fireEvent.change(screen.getByLabelText('Nombre de personnes'), { target: { value: '600' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer et rechercher/ }))

    await waitFor(() => expect(ecritures).toEqual(['PATCH /api/me']))
  })
})

describe('Les bornes ne sont plus recopiées dans le JSX', () => {
  // Les formulaires référencent `INPUT_LIMITS`, jamais le littéral.
  const formulaires = [
    '../src/pages/AdminAdmins.tsx',
    '../src/pages/AdminLogements.tsx',
    '../src/pages/HebergeurDemandes.tsx',
    '../src/pages/HebergeurLogementNouveau.tsx',
    '../src/pages/JumelageFiche.tsx',
    '../src/pages/Logement.tsx',
    '../src/pages/ProfilVolontaire.tsx',
    '../src/pages/UniteAnnonce.tsx',
  ]

  for (const chemin of formulaires) {
    it(`${chemin.split('/').pop()} tire ses bornes d’INPUT_LIMITS`, () => {
      const source = readFileSync(join(__dirname, chemin), 'utf8')
      expect(source).toContain('INPUT_LIMITS')
      expect(source).not.toMatch(/\bmax=\{\d/)
      expect(source).not.toMatch(/\bmaxLength=\{\d/)
    })
  }
})

import type { Me } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfilHebergeur } from '../src/pages/ProfilHebergeur'
import { ProfilVolontaire } from '../src/pages/ProfilVolontaire'

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
  hasActiveAd: false,
  createdAt: '2026-08-01T10:00:00.000Z',
}

let profil: Me = ME
const fetchMock = vi.fn(async (input: unknown) => {
  const url = String(input)
  if (url.startsWith('/api/me')) return { status: 200, json: async () => profil }
  throw new Error(`fetch inattendu : ${url}`)
})

/** Affiche le chemin courant pour vérifier la redirection après enregistrement. */
function SondeLocation() {
  const { pathname } = useLocation()
  return <output data-testid="sonde-path">{pathname}</output>
}

function rendre(chemin: string, element: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[chemin]}>
        <SondeLocation />
        <Routes>
          <Route path={chemin} element={element} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  profil = ME
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Profil volontaire — « Et si besoin »', () => {
  it('propose l’espace hébergeur tant qu’aucun logement n’existe', async () => {
    rendre('/profil', <ProfilVolontaire />)
    expect(await screen.findByRole('button', { name: 'Proposer aussi un logement' })).toBeTruthy()
  })

  it('ne le propose plus quand l’hébergeur a déjà un logement', async () => {
    profil = { ...ME, hasListings: true }
    rendre('/profil', <ProfilVolontaire />)
    await screen.findByRole('button', { name: 'Enregistrer et rechercher' })
    expect(screen.queryByText('Et si besoin')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Proposer aussi un logement' })).toBeNull()
  })
})

describe('Profil hébergeur — CTA selon les logements existants', () => {
  it('sans logement : « Créer mon premier logement » puis la création', async () => {
    rendre('/hebergeur', <ProfilHebergeur />)
    fireEvent.click(await screen.findByRole('button', { name: 'Créer mon premier logement' }))
    await waitFor(() =>
      expect(screen.getByTestId('sonde-path').textContent).toBe('/hebergeur/logements/nouveau'),
    )
  })

  it('avec logement : « Voir mes logements » puis la liste', async () => {
    profil = { ...ME, hasListings: true }
    rendre('/hebergeur', <ProfilHebergeur />)
    fireEvent.click(await screen.findByRole('button', { name: 'Voir mes logements' }))
    await waitFor(() =>
      expect(screen.getByTestId('sonde-path').textContent).toBe('/hebergeur/logements'),
    )
  })
})

describe('Profil hébergeur — « Et si besoin »', () => {
  it('propose l’espace volontaire à l’hébergeur pur', async () => {
    profil = { ...ME, seeksAccommodation: false }
    rendre('/hebergeur', <ProfilHebergeur />)
    expect(
      await screen.findByRole('button', { name: 'Chercher aussi un logement, ailleurs' }),
    ).toBeTruthy()
  })

  it('ne le propose plus quand l’espace volontaire est déjà ouvert', async () => {
    rendre('/hebergeur', <ProfilHebergeur />)
    await screen.findByRole('button', { name: 'Créer mon premier logement' })
    expect(screen.queryByText('Et si besoin')).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Chercher aussi un logement, ailleurs' }),
    ).toBeNull()
  })
})

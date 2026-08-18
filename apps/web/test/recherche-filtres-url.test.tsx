import type { AccessGrid, ListingCard, Me } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logement } from '../src/pages/Logement'
import { Recherche } from '../src/pages/Recherche'

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
  accessibilityNeeds: ['pmr'],
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

const CARTE: ListingCard = {
  id: 'log-1',
  category: 'PRIVATE',
  site: 'lourdes',
  title: 'Chambre privée · 2 places',
  displayArea: 'Lourdes centre',
  distanceKm: 1.2,
  capacity: 2,
  availableFrom: '2026-09-25',
  availableTo: '2026-09-28',
  access: GRILLE_VIDE,
  parkingEase: null,
  bedTypes: ['PRIVATE_ROOM'],
  priceInfo: null,
}

function reponseJson(data: unknown) {
  return { status: 200, json: async () => data }
}

/** fetch stubbé : /me, recherche (URL mémorisée) et fiche (404 pour l'id « introuvable »). */
let urlsListings: string[] = []
const fetchMock = vi.fn(async (input: unknown) => {
  const url = String(input)
  if (url.startsWith('/api/me')) return reponseJson(ME)
  if (url.startsWith('/api/listings?')) {
    urlsListings.push(url)
    return reponseJson({ items: [CARTE], total: 1, page: 1, pageSize: 60 })
  }
  if (url.startsWith('/api/listings/')) return { status: 404, json: async () => null }
  throw new Error(`fetch inattendu : ${url}`)
})

/** Affiche la query string courante pour l'inspecter depuis les tests. */
function SondeLocation() {
  const { search } = useLocation()
  return <output data-testid="sonde-search">{search}</output>
}

function rendreRecherche(entree: string) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[entree]}>
        <Routes>
          <Route
            path="/recherche"
            element={
              <>
                <Recherche />
                <SondeLocation />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function chip(nom: string | RegExp): HTMLElement {
  return screen.getByRole('button', { name: nom })
}

/** Le bouton du range picker de dates (libellé « 25 → 28 sept. » par défaut). */
function boutonDates(): HTMLElement {
  return screen.getByRole('button', { name: 'Dates du séjour' })
}

/** Ouvre le popover puis clique arrivée et départ (noms accessibles des jours, ex. /26 septembre/). */
function choisirDates(arrivee: RegExp, depart: RegExp) {
  fireEvent.click(boutonDates())
  fireEvent.click(screen.getByRole('button', { name: arrivee }))
  fireEvent.click(screen.getByRole('button', { name: depart }))
}

beforeEach(() => {
  urlsListings = []
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Recherche — les filtres choisis sont persistés dans l’URL', () => {
  it('écrit chaque filtre dans la query string et le reporte sur le lien de la fiche', async () => {
    rendreRecherche('/recherche')
    await screen.findByRole('link', { name: /Chambre privée/ })

    fireEvent.click(chip('Paris'))
    fireEvent.click(chip('Canapé'))
    fireEvent.click(chip('Tente'))
    fireEvent.click(chip('Compatibles avec mes besoins'))
    fireEvent.click(chip(/^Facile$/))
    fireEvent.change(screen.getByLabelText('Nombre de personnes'), { target: { value: '4' } })
    choisirDates(/26 septembre/, /28 septembre/)

    const parametres = new URLSearchParams(screen.getByTestId('sonde-search').textContent ?? '')
    expect(parametres.get('site')).toBe('paris')
    expect(parametres.getAll('types')).toEqual(['COUCH', 'TENT_SPOT'])
    expect(parametres.get('besoins')).toBe('1')
    expect(parametres.get('parking')).toBe('EASY')
    expect(parametres.get('people')).toBe('4')
    expect(parametres.get('from')).toBe('2026-09-26')
    // Le 28 est le départ par défaut : il ne figure pas dans l'URL
    expect(parametres.get('to')).toBeNull()

    // La carte emporte toute la recherche : le « Retour » de la fiche pourra la restaurer
    const lien = await screen.findByRole('link', { name: /Chambre privée/ })
    const [chemin, query] = (lien.getAttribute('href') ?? '').split('?')
    expect(chemin).toBe('/logements/log-1')
    expect(query).toBe(parametres.toString())
  })

  it('re-clic sur un filtre = retiré de l’URL ; les défauts n’y figurent jamais', async () => {
    rendreRecherche('/recherche')
    await screen.findByRole('link', { name: /Chambre privée/ })

    const sonde = screen.getByTestId('sonde-search')
    expect(sonde.textContent).toBe('')

    fireEvent.click(chip('Canapé'))
    expect(sonde.textContent).toContain('types=COUCH')
    fireEvent.click(chip('Canapé'))
    expect(sonde.textContent).toBe('')

    // Revenir au site par défaut (Lourdes) nettoie aussi l'URL
    fireEvent.click(chip('Paris'))
    fireEvent.click(chip('Lourdes'))
    expect(sonde.textContent).toBe('')
  })
})

describe('Recherche — les filtres de l’URL sont réappliqués (retour depuis une fiche)', () => {
  it('restaure chips, champs et requête API depuis la query string', async () => {
    rendreRecherche(
      '/recherche?site=paris&types=COUCH&types=TENT_SPOT&besoins=1&parking=MEDIUM&people=4&from=2026-09-26&to=2026-09-27',
    )
    await screen.findByRole('link', { name: /Chambre privée/ })

    expect(chip('Paris').getAttribute('aria-pressed')).toBe('true')
    expect(chip('Canapé').getAttribute('aria-pressed')).toBe('true')
    expect(chip('Tente').getAttribute('aria-pressed')).toBe('true')
    expect(chip('Compatibles avec mes besoins').getAttribute('aria-pressed')).toBe('true')
    expect(chip(/Moyen/).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText<HTMLInputElement>('Nombre de personnes').value).toBe('4')
    expect(boutonDates().textContent).toBe('26 → 27 sept.')

    // La requête envoyée à l'API reflète bien les filtres restaurés
    const requete = new URL(urlsListings.at(-1) ?? '', 'http://test').searchParams
    expect(requete.get('site')).toBe('paris')
    expect(requete.getAll('types')).toEqual(['COUCH', 'TENT_SPOT'])
    expect(requete.getAll('access')).toEqual(['pmr'])
    expect(requete.get('parking')).toBe('MEDIUM')
    expect(requete.get('people')).toBe('4')
    expect(requete.get('from')).toBe('2026-09-26')
    expect(requete.get('to')).toBe('2026-09-27')
  })

  it('retombe sur les défauts quand la query string contient des valeurs invalides', async () => {
    rendreRecherche(
      '/recherche?site=nulle-part&types=YOLO&parking=IMPOSSIBLE&from=pas-une-date&besoins=oui',
    )
    await screen.findByRole('link', { name: /Chambre privée/ })

    expect(chip('Lourdes').getAttribute('aria-pressed')).toBe('true')
    expect(chip('Canapé').getAttribute('aria-pressed')).toBe('false')
    expect(boutonDates().textContent).toBe('25 → 28 sept.')

    const requete = new URL(urlsListings.at(-1) ?? '', 'http://test').searchParams
    expect(requete.get('site')).toBe('lourdes')
    expect(requete.get('from')).toBe('2026-09-25')
    expect(requete.getAll('types')).toEqual([])
    expect(requete.get('parking')).toBeNull()
    expect(requete.get('access')).toBeNull()
  })

  it('retombe sur les défauts pour des dates hors fenêtre événement (année partielle, etc.)', async () => {
    // « to=0005-02-05 » : année en cours de saisie dans l'ancien input natif — bien
    // formée mais hors fenêtre. « from=2026-01-01 » : idem, hors bornes.
    rendreRecherche('/recherche?from=2026-01-01&to=0005-02-05')
    await screen.findByRole('link', { name: /Chambre privée/ })

    expect(boutonDates().textContent).toBe('25 → 28 sept.')
    const requete = new URL(urlsListings.at(-1) ?? '', 'http://test').searchParams
    expect(requete.get('from')).toBe('2026-09-25')
    expect(requete.get('to')).toBe('2026-09-28')
  })

  it('retombe sur les défauts quand l’arrivée n’est pas avant le départ (inversé ou séjour d’un jour)', async () => {
    for (const query of ['from=2026-09-28&to=2026-09-26', 'from=2026-09-26&to=2026-09-26']) {
      urlsListings = []
      const vue = rendreRecherche(`/recherche?${query}`)
      await screen.findByRole('link', { name: /Chambre privée/ })

      expect(boutonDates().textContent).toBe('25 → 28 sept.')
      const requete = new URL(urlsListings.at(-1) ?? '', 'http://test').searchParams
      expect(requete.get('from')).toBe('2026-09-25')
      expect(requete.get('to')).toBe('2026-09-28')
      vue.unmount()
    }
  })
})

describe('Recherche — comportement du range picker', () => {
  it('ne change ni l’URL ni la requête tant que le range est incomplet', async () => {
    rendreRecherche('/recherche')
    await screen.findByRole('link', { name: /Chambre privée/ })
    const nbRequetes = urlsListings.length

    fireEvent.click(boutonDates())
    fireEvent.click(screen.getByRole('button', { name: /26 septembre/ }))

    expect(screen.getByTestId('sonde-search').textContent).toBe('')
    expect(urlsListings.length).toBe(nbRequetes)
    // Le popover reste ouvert en attendant le départ
    expect(screen.getByRole('dialog', { name: 'Choisir les dates' })).toBeTruthy()
  })

  it('refuse le séjour d’un jour : re-clic sur le même jour = désélection, rien n’est commité', async () => {
    rendreRecherche('/recherche')
    await screen.findByRole('link', { name: /Chambre privée/ })
    const nbRequetes = urlsListings.length

    choisirDates(/26 septembre/, /26 septembre/)

    // Pas de from=to possible : le popover reste ouvert, aucune URL ni requête émise
    expect(screen.getByTestId('sonde-search').textContent).toBe('')
    expect(urlsListings.length).toBe(nbRequetes)
    expect(screen.getByRole('dialog', { name: 'Choisir les dates' })).toBeTruthy()

    // On peut repartir : 26 puis 27 = une nuit, commit normal
    fireEvent.click(screen.getByRole('button', { name: /26 septembre/ }))
    fireEvent.click(screen.getByRole('button', { name: /27 septembre/ }))
    const parametres = new URLSearchParams(screen.getByTestId('sonde-search').textContent ?? '')
    expect(parametres.get('from')).toBe('2026-09-26')
    expect(parametres.get('to')).toBe('2026-09-27')
    expect(screen.queryByRole('dialog', { name: 'Choisir les dates' })).toBeNull()
  })

  it('Échap ferme le popover sans rien changer et rend le focus au bouton', async () => {
    rendreRecherche('/recherche')
    await screen.findByRole('link', { name: /Chambre privée/ })

    fireEvent.click(boutonDates())
    const dialogue = screen.getByRole('dialog', { name: 'Choisir les dates' })
    fireEvent.keyDown(dialogue, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Choisir les dates' })).toBeNull()
    expect(screen.getByTestId('sonde-search').textContent).toBe('')
    expect(document.activeElement).toBe(boutonDates())
  })
})

describe('Recherche — la query est validée par le schéma de l’API avant l’envoi', () => {
  it('envoie un grand groupe sans le rejeter (URL partagée `?people=60`)', async () => {
    rendreRecherche('/recherche?site=paris&to=2026-09-25&people=60')
    await screen.findByRole('link', { name: /Chambre privée/ })

    const requete = new URL(urlsListings.at(-1) ?? '', 'http://test').searchParams
    expect(requete.get('people')).toBe('60')
    expect(requete.get('site')).toBe('paris')
    // `to=2026-09-25` seul = zéro nuit avec le from par défaut (25) : dates retombées
    // sur les défauts (au moins une nuit), la recherche part quand même
    expect(requete.get('to')).toBe('2026-09-28')
  })

  it('cherche jusqu’au plafond commun avec la demande (600 personnes)', async () => {
    rendreRecherche('/recherche?people=600')
    await screen.findByRole('link', { name: /Chambre privée/ })

    const requete = new URL(urlsListings.at(-1) ?? '', 'http://test').searchParams
    expect(requete.get('people')).toBe('600')
  })

  it('ne part pas en 400 : une valeur refusée par le schéma bloque la requête et s’affiche', async () => {
    rendreRecherche('/recherche?people=0')

    expect(await screen.findByText(/nombre entier de personnes/i)).toBeTruthy()
    expect(urlsListings).toEqual([])
  })

  it('au-delà du plafond, la requête est bloquée et signalée', async () => {
    rendreRecherche('/recherche?people=601')

    expect(await screen.findByText(/entre 1 et 600/i)).toBeTruthy()
    expect(urlsListings).toEqual([])
  })

  it('vider le champ retire le critère au lieu de casser la recherche', async () => {
    rendreRecherche('/recherche')
    await screen.findByRole('link', { name: /Chambre privée/ })

    fireEvent.change(screen.getByLabelText('Nombre de personnes'), { target: { value: '' } })

    await waitFor(() => {
      const requete = new URL(urlsListings.at(-1) ?? '', 'http://test').searchParams
      expect(requete.get('people')).toBeNull()
    })
    expect(screen.queryByText(/nombre entier de personnes/i)).toBeNull()
  })
})

describe('Logement — « Retour à la recherche » conserve les filtres', () => {
  it('pointe vers /recherche avec la query string reçue de la recherche', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/logements/log-404?site=paris&types=COUCH&besoins=1']}>
          <Routes>
            <Route path="/logements/:id" element={<Logement />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const retour = await screen.findByRole('link', { name: /Retour à la recherche/ })
    await waitFor(() =>
      expect(retour.getAttribute('href')).toBe('/recherche?site=paris&types=COUCH&besoins=1'),
    )
  })
})

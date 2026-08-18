import type { AccessGrid, BedType, MyListing } from '@repo/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { SigneName } from '../ui'

/**
 * Partagé entre les trois écrans du parcours hébergeur (A.8, A.9, A.10-A.11) :
 * requêtes /my/listings et /my/received-requests, chips Libre/Complet, libellés
 * des couchages et helpers de dates relatives. Rien ici ne touche à src/lib/.
 */

export const MY_LISTINGS_KEY = ['my-listings'] as const
export const RECEIVED_REQUESTS_KEY = ['received-requests'] as const

/** GET /my/listings — vue propriétaire (liste A.9, disponibilité A.8, prefill édition). */
export function useMyListings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: MY_LISTINGS_KEY,
    queryFn: async () => {
      const res = await api.my.listings.$get()
      if (res.status === 200) return (await res.json()).items
      throw new Error(`GET /my/listings : ${res.status}`)
    },
    enabled: options?.enabled,
  })
}

/** GET /my/received-requests — demandes reçues sur mes logements (A.8). */
export function useReceivedRequests() {
  return useQuery({
    queryKey: RECEIVED_REQUESTS_KEY,
    queryFn: async () => {
      const res = await api.my['received-requests'].$get()
      if (res.status === 200) return (await res.json()).items
      throw new Error(`GET /my/received-requests : ${res.status}`)
    },
  })
}

/**
 * PATCH /my/listings/{id}/status — chips « Libre »/« Complet » et bouton
 * « Réactiver » (OPEN remet aussi hiddenAt à null côté API).
 */
export function useListingStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; status: 'OPEN' | 'FULL' }) => {
      const res = await api.my.listings[':id'].status.$patch({
        param: { id: input.id },
        json: { status: input.status },
      })
      if (res.status !== 200) throw new Error(`PATCH statut du logement : ${res.status}`)
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_LISTINGS_KEY })
    },
  })
}

/** Ordre du select « Type » de la maquette (A.10). */
export const BED_TYPE_ORDER: readonly BedType[] = [
  'PRIVATE_ROOM',
  'COUCH',
  'FLOOR_BED',
  'TENT_SPOT',
]

export const BED_TYPE_LABELS: Record<BedType, string> = {
  PRIVATE_ROOM: 'Chambre privée',
  COUCH: 'Canapé',
  FLOOR_BED: 'Couchage sommaire',
  TENT_SPOT: 'Emplacement tente',
}

const BED_SIGNES: Record<BedType, SigneName> = {
  PRIVATE_ROOM: 'tente',
  FLOOR_BED: 'campement',
  TENT_SPOT: 'soleil',
  COUCH: 'etoile',
}

/** Signe de vignette d'un logement (A.9) — catégorie, sinon premier type de couchage. */
export function listingSigne(listing: Pick<MyListing, 'category' | 'bedTypes'>): SigneName {
  if (listing.category === 'HOTEL') return 'promesse'
  if (listing.category === 'COLLECTIVE') return 'paix'
  if (listing.category === 'SCOUT_BASE') return 'campement'
  const first = listing.bedTypes[0]
  return first ? BED_SIGNES[first] : 'tente'
}

/** « 3 personnes » / « seul » (maquette : « Thomas Renard · seul »). */
export function peopleLabel(count: number): string {
  return count === 1 ? 'seul' : `${count} personnes`
}

/** « 8 personnes » / « 1 personne » — capacités. */
export function countPersonnes(count: number): string {
  return count === 1 ? '1 personne' : `${count} personnes`
}

const DAY_MS = 86_400_000

/** Badge « Expire dans {N} jour(s) » à partir d'expiresAt (arrondi supérieur, minimum 1). */
export function expiresLabel(expiresAt: string): string {
  const days = Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS))
  return days === 1 ? 'Expire dans 1 jour' : `Expire dans ${days} jours`
}

/** « aujourd'hui » / « hier » / « il y a N jours » — « question posée {relatif} ». */
export function relativeDaysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS)
  if (days <= 0) return 'aujourd’hui'
  if (days === 1) return 'hier'
  return `il y a ${days} jours`
}

/** Grille d'accessibilité vierge (création, étape 2/2). */
export function emptyAccessGrid(): AccessGrid {
  return {
    pmr: false,
    electricWheelchair: false,
    fewSteps: false,
    humanHelp: false,
    transport: false,
    parking: false,
    assistanceDog: false,
    quiet: false,
  }
}

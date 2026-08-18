import type { BedType, ListingCard } from '@repo/contracts'
import type { SigneName } from '../ui'

/**
 * Aides partagées du parcours volontaire (Recherche A.4, Fiche logement A.5,
 * Mes demandes A.6). Pas de JSX ici — uniquement du texte et des mappings.
 */

/** Signe de substitut photo par type de couchage (consigne A.4 / C.2). */
const SIGNE_PAR_COUCHAGE: Record<BedType, SigneName> = {
  PRIVATE_ROOM: 'tente',
  FLOOR_BED: 'campement',
  TENT_SPOT: 'soleil',
  COUCH: 'etoile',
}

/** Signe d’un logement : bedTypes[0] si présent, sinon la catégorie. */
export function signeDe(logement: Pick<ListingCard, 'category' | 'bedTypes'>): SigneName {
  const premier = logement.bedTypes[0]
  if (premier) return SIGNE_PAR_COUCHAGE[premier]
  if (logement.category === 'HOTEL') return 'promesse'
  if (logement.category === 'COLLECTIVE') return 'paix'
  if (logement.category === 'SCOUT_BASE') return 'campement'
  return 'tente'
}

/** « 3 personnes » / « 1 personne ». */
export function personnesLabel(nombre: number): string {
  return `${nombre} personne${nombre > 1 ? 's' : ''}`
}

/** « Claire M. » → « Claire » — null pour un logement institutionnel (sans hébergeur nommé). */
export function prenomDe(hostDisplayName: string | null): string | null {
  if (!hostDisplayName) return null
  const [prenom] = hostDisplayName.trim().split(' ')
  return prenom ?? null
}

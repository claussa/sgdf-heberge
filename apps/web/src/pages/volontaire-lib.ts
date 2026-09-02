import type { BedType, ListingCard, ListingDetail } from '@repo/contracts'
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

/** Libellés des couchages (carte A.4, fiche A.5) — genre pour l’accord de « chacun(e) ». */
const COUCHAGE_LABELS: Record<BedType, { singulier: string; pluriel: string; feminin: boolean }> = {
  PRIVATE_ROOM: { singulier: 'chambre privée', pluriel: 'chambres privées', feminin: true },
  COUCH: { singulier: 'canapé', pluriel: 'canapés', feminin: false },
  FLOOR_BED: { singulier: 'couchage sommaire', pluriel: 'couchages sommaires', feminin: false },
  TENT_SPOT: { singulier: 'emplacement tente', pluriel: 'emplacements tente', feminin: false },
}

function capitaliser(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

/** « Chambre privée · Canapé » — ligne de types de la carte, dans l’ordre reçu (du plus grand au plus petit). */
export function typesCouchagesLabel(bedTypes: readonly BedType[]): string {
  return bedTypes.map((type) => capitaliser(COUCHAGE_LABELS[type].singulier)).join(' · ')
}

/** « 2 chambres privées · 2 personnes chacune · 1er étage, ascenseur » — une ligne de la fiche, couchages RESTANTS. */
export function ligneCouchage(bed: ListingDetail['beds'][number]): string {
  const libelle = COUCHAGE_LABELS[bed.type]
  const restants = bed.count - bed.takenCount
  const chacun = restants > 1 ? (libelle.feminin ? ' chacune' : ' chacun') : ''
  return [
    `${restants} ${restants > 1 ? libelle.pluriel : libelle.singulier}`,
    `${personnesLabel(bed.capacityEach)}${chacun}`,
    ...(bed.note ? [bed.note] : []),
  ].join(' · ')
}

/** Lignes encore libres de la fiche, avec une clé unique (deux lignes identiques restent distinctes). */
export function lignesCouchages(beds: ListingDetail['beds']): { cle: string; texte: string }[] {
  const vus = new Map<string, number>()
  return beds
    .filter((bed) => bed.count > bed.takenCount)
    .map((bed) => {
      const texte = ligneCouchage(bed)
      const n = (vus.get(texte) ?? 0) + 1
      vus.set(texte, n)
      return { cle: `${texte}#${n}`, texte }
    })
}

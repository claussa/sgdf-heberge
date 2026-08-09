import type { BedType, ListingCategory } from '@repo/db'

/**
 * Dérivation des titres de logements (le titre n'est PAS stocké pour les logements
 * de particuliers — il périmerait à chaque modification des couchages).
 * Wording de la maquette : « Chambre privée · 2 places », « Chez Claire — 2 chambres,
 * 1 canapé, 2 couchages ».
 */

interface BedLine {
  type: BedType
  count: number
  capacityEach: number
}

const BED_LABELS: Record<BedType, { singular: string; plural: string }> = {
  PRIVATE_ROOM: { singular: 'chambre privée', plural: 'chambres privées' },
  COUCH: { singular: 'canapé', plural: 'canapés' },
  FLOOR_BED: { singular: 'couchage sommaire', plural: 'couchages sommaires' },
  TENT_SPOT: { singular: 'emplacement tente', plural: 'emplacements tente' },
}

/** « 2 chambres privées, 1 canapé, 2 couchages sommaires » */
export function bedSummary(beds: BedLine[]): string {
  return beds
    .map(
      (b) => `${b.count} ${b.count > 1 ? BED_LABELS[b.type].plural : BED_LABELS[b.type].singular}`,
    )
    .join(', ')
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Titre de carte de recherche / fiche.
 * Institutionnels : le titre saisi par l'admin. Particuliers : le couchage dominant,
 * ex. « Chambre privée · 8 places ».
 */
export function listingCardTitle(listing: {
  category: ListingCategory
  title: string | null
  capacity: number
  beds: BedLine[]
}): string {
  if (listing.category !== 'PRIVATE') {
    return listing.title ?? 'Hébergement'
  }
  const dominant = [...listing.beds].sort(
    (a, b) => b.count * b.capacityEach - a.count * a.capacityEach,
  )[0]
  const label = dominant ? capitalize(BED_LABELS[dominant.type].singular) : 'Logement'
  return `${label} · ${listing.capacity} place${listing.capacity > 1 ? 's' : ''}`
}

/** Vue « Mes logements » : « Chez Claire — 2 chambres privées, 1 canapé » */
export function listingOwnerTitle(listing: {
  category: ListingCategory
  title: string | null
  beds: BedLine[]
  ownerFirstName: string | null
}): string {
  if (listing.category !== 'PRIVATE') {
    return listing.title ?? 'Hébergement'
  }
  const prefix = listing.ownerFirstName ? `Chez ${listing.ownerFirstName}` : 'Mon logement'
  return listing.beds.length > 0 ? `${prefix} — ${bedSummary(listing.beds)}` : prefix
}

/** « chez Claire M. » — prénom + initiale, seule identité publique avant acceptation */
export function hostDisplayName(owner: {
  firstName: string | null
  lastName: string | null
}): string | null {
  if (!owner.firstName) return null
  const initial = owner.lastName ? ` ${owner.lastName.charAt(0).toUpperCase()}.` : ''
  return `${owner.firstName}${initial}`
}

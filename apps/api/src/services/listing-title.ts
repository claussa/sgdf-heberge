import type { BedType, ListingCategory } from '@repo/db'

/**
 * Dérivation des titres de logements (le titre n'est PAS stocké pour les logements
 * de particuliers — il périmerait à chaque modification des couchages).
 * Wording : « Chez Claire · 5 places » (carte, fiche, emails au demandeur),
 * « Chez Claire — 2 chambres, 1 canapé, 2 couchages » (vue hébergeur).
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

/** Départage des types à capacité égale : ordre du select « Type » (A.10). */
const BED_TYPE_ORDER = Object.keys(BED_LABELS) as BedType[]

/** « 2 chambres privées, 1 canapé, 2 couchages sommaires » */
export function bedSummary(beds: BedLine[]): string {
  return beds
    .map(
      (b) => `${b.count} ${b.count > 1 ? BED_LABELS[b.type].plural : BED_LABELS[b.type].singular}`,
    )
    .join(', ')
}

/** Types présents du plus grand (Σ count × capacityEach) au plus petit, sans doublon — icône et ligne de types de la carte. */
export function rankedBedTypes(beds: BedLine[]): BedType[] {
  const totals = new Map<BedType, number>()
  for (const bed of beds) {
    totals.set(bed.type, (totals.get(bed.type) ?? 0) + bed.count * bed.capacityEach)
  }
  return [...totals.entries()]
    .sort(
      ([typeA, totalA], [typeB, totalB]) =>
        totalB - totalA || BED_TYPE_ORDER.indexOf(typeA) - BED_TYPE_ORDER.indexOf(typeB),
    )
    .map(([type]) => type)
}

/** « Chez Claire · 5 places » (institutionnels : le title admin) — le type est dans bedTypes, pas dans le titre. */
export function listingCardTitle(listing: {
  category: ListingCategory
  title: string | null
  capacity: number
  owner: { firstName: string | null }
}): string {
  if (listing.category !== 'PRIVATE') {
    return listing.title ?? 'Hébergement'
  }
  const prefix = listing.owner.firstName ? `Chez ${listing.owner.firstName}` : 'Logement'
  return `${prefix} · ${listing.capacity} place${listing.capacity > 1 ? 's' : ''}`
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

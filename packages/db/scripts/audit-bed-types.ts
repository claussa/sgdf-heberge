/**
 * Audit (lecture seule) des logements de particuliers à plusieurs types de couchages.
 *
 * Contexte : le titre de carte est dérivé du couchage DOMINANT (listingCardTitle,
 * apps/api : max count × capacityEach) alors que le filtre « Type » de la recherche
 * matche TOUS les types présents (beds.some). Un logement « 1 chambre privée (3 pl.)
 * + 1 canapé (4 pl.) » ressort donc sur le chip « Chambre privée » avec le titre
 * « Canapé · 7 places » — perçu comme un résultat aberrant.
 *
 * Le script compte les logements concernés et mesure, chip par chip, la part des
 * résultats de recherche dont le titre affiche un autre type que celui filtré.
 *
 * Aucun champ chiffré n'est lu (select explicite, §5) → seul DATABASE_URL est requis.
 * Sortie sans PII : IDs, sites, statuts et compteurs uniquement (§7).
 *
 * Usage : pnpm --filter @repo/db db:audit-bed-types [--list]
 *   --list : détaille chaque logement concerné (ID, site, statut, couchages)
 */
import { type BedType, PrismaClient } from '@prisma/client'

const listDetails = process.argv.slice(2).includes('--list')

/** Libellés des chips « Type » de la recherche (apps/web, Recherche.tsx). */
const BED_LABELS: Record<BedType, string> = {
  PRIVATE_ROOM: 'Chambre privée',
  COUCH: 'Canapé',
  FLOOR_BED: 'Couchage sommaire',
  TENT_SPOT: 'Tente',
}
const BED_TYPES = Object.keys(BED_LABELS) as BedType[]

interface BedLine {
  type: BedType
  count: number
  capacityEach: number
}

/** Même règle que listingCardTitle : le type de la ligne de plus grande capacité totale. */
function dominantType(beds: BedLine[]): BedType | null {
  const dominant = [...beds].sort((a, b) => b.count * b.capacityEach - a.count * a.capacityEach)[0]
  return dominant?.type ?? null
}

function pct(part: number, total: number): string {
  return total === 0 ? '—' : `${Math.round((100 * part) / total)} %`
}

function increment<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function formatCounts<K>(map: Map<K, number>): string {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `${String(key)} ${n}`)
    .join(' · ')
}

// §7 — jamais log: ['query']. Aucun champ chiffré dans le select : client sans extension.
const db = new PrismaClient({ log: ['warn', 'error'] })

const listings = await db.listing.findMany({
  select: {
    id: true,
    site: true,
    category: true,
    status: true,
    hiddenAt: true,
    capacity: true,
    // Même ordre (non spécifié) que l'API : les égalités de capacité se départagent pareil.
    beds: { select: { type: true, count: true, capacityEach: true } },
  },
  orderBy: { createdAt: 'asc' },
})

const analysed = listings
  .filter((listing) => listing.category === 'PRIVATE')
  .map((listing) => ({
    ...listing,
    types: new Set(listing.beds.map((bed) => bed.type)),
    dominant: dominantType(listing.beds),
    // Critère de la recherche publique (searchListings) : OPEN et non masqué.
    visible: listing.status === 'OPEN' && listing.hiddenAt === null,
  }))

const institutionalWithBeds = listings.filter(
  (listing) => listing.category !== 'PRIVATE' && listing.beds.length > 0,
).length

console.info(
  `Audit des types de couchages — lecture seule. ${listings.length} logements : ` +
    `${analysed.length} particuliers, ${listings.length - analysed.length} institutionnels.`,
)
if (institutionalWithBeds > 0) {
  console.warn(
    `⚠️  ${institutionalWithBeds} logement(s) institutionnel(s) avec des lignes de couchages (anomalie).`,
  )
}

console.info('\nParticuliers par nombre de types de couchages distincts :')
for (let n = 0; n <= BED_TYPES.length; n += 1) {
  const count = analysed.filter((listing) => listing.types.size === n).length
  if (count > 0 || n <= 1) {
    console.info(`  ${n} type${n > 1 ? 's' : ''} : ${count}${n === 0 ? ' (aucune ligne)' : ''}`)
  }
}

const multi = analysed.filter((listing) => listing.types.size > 1)
const multiVisible = multi.filter((listing) => listing.visible)
const bySite = new Map<string, number>()
const byCombo = new Map<string, number>()
for (const listing of multi) {
  increment(bySite, listing.site)
  increment(
    byCombo,
    BED_TYPES.filter((type) => listing.types.has(type))
      .map((type) => BED_LABELS[type])
      .join(' + '),
  )
}

console.info(
  `\n➡️  Logements avec PLUS D'UN type de couchage : ${multi.length} / ${analysed.length} ` +
    `particuliers (${pct(multi.length, analysed.length)})`,
)
if (multi.length > 0) {
  console.info(`    dont visibles en recherche (OPEN, non masqués) : ${multiVisible.length}`)
  console.info(`    par site : ${formatCounts(bySite)}`)
  console.info(`    combinaisons : ${formatCounts(byCombo)}`)
}

const visible = analysed.filter((listing) => listing.visible)
console.info(
  `\nImpact par chip de filtre — sur les ${visible.length} logements de particuliers visibles :`,
)
console.info(
  `  ${'chip'.padEnd(18)}${'résultats'.padEnd(12)}${'titre d’un autre type'.padEnd(24)}part trompeuse`,
)
for (const type of BED_TYPES) {
  const matching = visible.filter((listing) => listing.types.has(type))
  const misleading = matching.filter((listing) => listing.dominant !== type)
  console.info(
    `  ${BED_LABELS[type].padEnd(18)}${String(matching.length).padEnd(12)}` +
      `${String(misleading.length).padEnd(24)}${pct(misleading.length, matching.length)}`,
  )
}

if (listDetails && multi.length > 0) {
  console.info(
    '\nDétail des logements à plusieurs types (ID · site · statut · couchages → titre) :',
  )
  for (const listing of multi) {
    const beds = listing.beds
      .map((bed) => `${bed.count}× ${BED_LABELS[bed.type]} (${bed.capacityEach} pers.)`)
      .join(' + ')
    const status = listing.visible
      ? 'visible'
      : `${listing.status}${listing.hiddenAt ? ', masqué' : ''}`
    const title = listing.dominant ? BED_LABELS[listing.dominant] : '?'
    console.info(
      `  ${listing.id} · ${listing.site} · ${status} · ${listing.capacity} places · ${beds} → « ${title} »`,
    )
  }
}

await db.$disconnect()

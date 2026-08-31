/**
 * Détection (et correction optionnelle) des logements rattachés au mauvais site
 * de l'événement — ex. une adresse en région parisienne posée sur « Lourdes ».
 *
 * Pour chaque logement, le libellé BAN stocké (addressFull, chiffré) est re-géocodé
 * via api-adresse.data.gouv.fr (re-résolution déterministe : le libellé vient de la
 * BAN), puis la distance haversine à chaque site de @repo/event-config est calculée.
 * Un logement est signalé quand un autre site est plus proche que le sien d'au moins
 * `--threshold-km` (marge anti-faux-positif pour les adresses entre deux sites).
 *
 * Par défaut le script ne fait que signaler. Avec --fix, il bascule chaque logement
 * signalé sur son site le plus proche et recalcule distanceKm (au passage, cela
 * répare aussi les distanceKm mis à null par un changement de site sans adresse).
 *
 * §7 — jamais d'adresse dans la sortie : uniquement l'ID et displayArea (publique).
 * Prérequis env : DATABASE_URL, PRISMA_FIELD_ENCRYPTION_KEY, PRISMA_FIELD_ENCRYPTION_HASH_SALT.
 *
 * Usage : pnpm --filter @repo/db db:fix-site-mismatch [--fix] [--threshold-km=50]
 */
import { eventConfig } from '@repo/event-config'
import { createPrismaClient } from '../src/client'

const args = process.argv.slice(2)
const applyFix = args.includes('--fix')
const thresholdArg = args.find((a) => a.startsWith('--threshold-km='))
const thresholdKm = thresholdArg ? Number(thresholdArg.split('=')[1]) : 50
if (!Number.isFinite(thresholdKm) || thresholdKm < 0) {
  console.error('--threshold-km invalide (nombre de km ≥ 0 attendu).')
  process.exit(1)
}

interface LatLng {
  lat: number
  lng: number
}

// Copie de apps/api/src/lib/geocode.ts (packages/db ne peut pas dépendre de apps/api).
const EARTH_RADIUS_KM = 6371
const toRad = (deg: number): number => (deg * Math.PI) / 180
function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** Même re-résolution que resolveStoredAddress (AdminLogements.tsx) : libellé BAN → coords. */
async function geocodeLabel(label: string): Promise<LatLng | null> {
  try {
    const res = await fetch(
      `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(label)}&limit=1`,
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      features?: Array<{ geometry: { coordinates: [number, number] } }>
    }
    const feature = data.features?.[0]
    if (!feature) return null
    const [lng, lat] = feature.geometry.coordinates
    return { lat, lng }
  } catch {
    return null
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const db = createPrismaClient()

const listings = await db.listing.findMany({
  select: {
    id: true,
    site: true,
    category: true,
    addressFull: true,
    displayArea: true,
    distanceKm: true,
  },
  orderBy: { createdAt: 'asc' },
})

console.info(
  `${listings.length} logements à vérifier — sites : ${eventConfig.sites
    .map((s) => s.slug)
    .join(', ')} — marge ${thresholdKm} km — mode ${applyFix ? 'FIX' : 'dry-run'}.`,
)

interface Mismatch {
  id: string
  nearestSlug: string
  nearestKm: number
}

const mismatches: Mismatch[] = []
const failures: string[] = []
let unknownSites = 0

for (const listing of listings) {
  // Politesse BAN (limite publique 50 req/s — on reste très en dessous)
  await sleep(150)
  const coords = await geocodeLabel(listing.addressFull)
  if (!coords) {
    failures.push(listing.id)
    continue
  }

  const ranked = eventConfig.sites
    .map((site) => ({ slug: site.slug, km: haversineKm(site.coords, coords) }))
    .sort((a, b) => a.km - b.km)
  const nearest = ranked[0]
  const assigned = ranked.find((r) => r.slug === listing.site)
  if (!assigned) {
    unknownSites += 1
    console.warn(`listing ${listing.id} : site « ${listing.site} » absent de la config, ignoré.`)
    continue
  }

  if (nearest.slug !== listing.site && assigned.km - nearest.km > thresholdKm) {
    mismatches.push({ id: listing.id, nearestSlug: nearest.slug, nearestKm: nearest.km })
    console.info(
      `⚠️  listing ${listing.id} (${listing.category}, ${listing.displayArea}) : ` +
        `site « ${listing.site} » à ${Math.round(assigned.km)} km` +
        ` → « ${nearest.slug} » à ${Math.round(nearest.km)} km`,
    )
  }
}

if (applyFix) {
  for (const mismatch of mismatches) {
    await db.listing.update({
      where: { id: mismatch.id },
      data: {
        site: mismatch.nearestSlug,
        // Même arrondi que computeDistanceKm (apps/api) : 0,1 km
        distanceKm: Math.round(mismatch.nearestKm * 10) / 10,
      },
    })
    console.info(`✅ listing ${mismatch.id} basculé sur « ${mismatch.nearestSlug} ».`)
  }
}

console.info(
  `Terminé : ${mismatches.length} logement(s) mal rattaché(s)` +
    `${applyFix ? ' (corrigés)' : ' (aucune écriture — relancer avec --fix pour corriger)'}, ` +
    `${failures.length} géocodage(s) en échec, ${unknownSites} site(s) inconnu(s).`,
)
if (failures.length > 0) {
  console.info(`À vérifier à la main (géocodage impossible) : ${failures.join(', ')}`)
}

await db.$disconnect()

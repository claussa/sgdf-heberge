import { siteBySlug } from '@repo/event-config'

/**
 * Dérivations géographiques PURES — aucun appel réseau ici : les coordonnées et le
 * libellé viennent du résultat BAN choisi côté client (décision 6 du plan v1).
 * L'API ne fait que dériver la zone d'affichage publique (« Paris 12e ») et la
 * distance au site de l'événement. Échec de dérivation ⇒ valeurs de repli, jamais
 * bloquant, et jamais d'adresse dans les logs (§7).
 */

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Distance orthodromique (formule haversine), en kilomètres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/**
 * Villes à arrondissements : motif de code postal + plage valide. Les deux derniers
 * chiffres du CP donnent l'arrondissement (75012 → 12, 75116 → 16, 69003 → 3, 13008 → 8).
 */
const ARRONDISSEMENTS: Record<string, { label: string; pattern: RegExp; max: number }> = {
  paris: { label: 'Paris', pattern: /^75\d{3}$/, max: 20 },
  lyon: { label: 'Lyon', pattern: /^690\d{2}$/, max: 9 },
  marseille: { label: 'Marseille', pattern: /^130\d{2}$/, max: 16 },
}

/** « 1er » / « 12e » */
function ordinal(n: number): string {
  return n === 1 ? '1er' : `${n}e`
}

/**
 * Zone d'affichage publique d'une adresse — la seule information de localisation
 * qui sort avant l'acceptation d'une demande (§6 du plan : adresse complète chiffrée).
 * Paris/Lyon/Marseille : « Paris 12e » dérivé du code postal ; sinon la ville telle quelle.
 */
export function deriveDisplayArea(input: { city: string; postcode: string }): string {
  const city = input.city.trim()
  const postcode = input.postcode.trim()
  const rule = ARRONDISSEMENTS[city.toLowerCase()]
  if (rule?.pattern.test(postcode)) {
    const n = Number(postcode.slice(-2))
    if (n >= 1 && n <= rule.max) return `${rule.label} ${ordinal(n)}`
  }
  return city
}

/**
 * Distance du logement au site de l'événement (coords de @repo/event-config),
 * arrondie à 0,1 km. null si le site est inconnu de la config (réutilisabilité :
 * le tri de recherche est en nulls last, jamais bloquant).
 */
export function computeDistanceKm(site: string, coords: LatLng): number | null {
  const config = siteBySlug(site)
  if (!config) return null
  return Math.round(haversineKm(config.coords, coords) * 10) / 10
}

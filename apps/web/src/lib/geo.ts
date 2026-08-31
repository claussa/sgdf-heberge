import { eventConfig, type SiteSlug } from '@repo/event-config'

/**
 * Dérivations géographiques côté SPA — même formule haversine que l'API
 * (apps/api/src/lib/geocode.ts), sur les coords de sites d'@repo/event-config.
 * Sert uniquement au pré-calcul d'affichage du formulaire logement : la valeur
 * de référence (distanceKm stockée) reste calculée par l'API à l'enregistrement.
 */

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** Distance d'un point à un site de l'événement, arrondie à 0,1 km. */
export function distanceToSite(site: SiteSlug, coords: LatLng): number {
  const config = eventConfig.sites.find((s) => s.slug === site)
  if (!config) return 0
  return Math.round(haversineKm(config.coords, coords) * 10) / 10
}

/** Site de l'événement le plus proche d'un point. */
export function nearestSite(coords: LatLng): SiteSlug {
  let best: (typeof eventConfig.sites)[number] = eventConfig.sites[0]
  let bestKm = haversineKm(best.coords, coords)
  for (const site of eventConfig.sites.slice(1)) {
    const km = haversineKm(site.coords, coords)
    if (km < bestKm) {
      best = site
      bestKm = km
    }
  }
  return best.slug
}

const KM_FORMAT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** « 6,2 km » */
export function formatKm(km: number): string {
  return `${KM_FORMAT.format(km)} km`
}

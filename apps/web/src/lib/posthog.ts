import posthog from 'posthog-js'

/**
 * PostHog Cloud EU — périmètre volontairement minimal, acté après analyse RGPD :
 * - erreurs front (équivalent Sentry) + pageviews + events explicites, RIEN d'autre ;
 * - PAS de session replay (adresses, téléphones et besoins d'accessibilité — donnée
 *   sensible — s'affichent à l'écran ; le chiffrement en base ne protège pas le DOM) ;
 * - PAS d'autocapture (le texte des éléments cliqués peut contenir des PII) ;
 * - identify() UNIQUEMENT avec l'ID interne, jamais d'email ni de nom en propriété ;
 * - persistence en MÉMOIRE : aucun cookie ni localStorage posé → pas de traceur au
 *   sens ePrivacy/CNIL, donc pas de bannière de consentement. Contrepartie assumée :
 *   les visiteurs anonymes ne sont pas suivis d'une page-load à l'autre (chaque
 *   chargement = nouveau device id) ; la continuité ne vaut que pour les connectés,
 *   via identify(uid) à chaque chargement.
 * Ne pas élargir sans re-passer par l'analyse (registre des traitements).
 */

const key: string | undefined = import.meta.env.VITE_POSTHOG_KEY

/**
 * Défense en profondeur : aucun `token=` ne doit partir en télémétrie. Le callback
 * magic link est une route API qui redirige en 302 vers une URL propre, la SPA ne
 * voit donc jamais le token — mais si ça change un jour, ceci le masque.
 */
const TOKEN_PARAM = /([?&#]token=)[^&#\s]+/gi

function scrubTokens(properties: Record<string, unknown>): Record<string, unknown> {
  for (const [k, v] of Object.entries(properties)) {
    if (typeof v === 'string') properties[k] = v.replace(TOKEN_PARAM, '$1[masqué]')
  }
  return properties
}

export function initAnalytics(): void {
  if (!key) return // dev sans clé : aucune télémétrie
  posthog.init(key, {
    // Impérativement l'endpoint UE (souveraineté §1)
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com',
    // Profil personne uniquement après identify(uid) — les anonymes restent des compteurs
    person_profiles: 'identified_only',
    autocapture: false,
    rageclick: false,
    capture_pageview: 'history_change',
    capture_pageleave: false,
    capture_performance: false,
    disable_session_recording: true,
    disable_surveys: true,
    capture_exceptions: true,
    // CNIL : aucun stockage navigateur (voir en-tête). Ne pas repasser en
    // localStorage/cookie sans mettre en place le consentement qui va avec.
    persistence: 'memory',
    sanitize_properties: scrubTokens,
  })
}

/** À l'authentification : ID interne seul, aucune propriété de profil. */
export function identifyUser(userId: string): void {
  if (key) posthog.identify(userId)
}

/** À la déconnexion : nouveau device id anonyme, l'identité ne survit pas à la session. */
export function resetAnalyticsIdentity(): void {
  if (key) posthog.reset()
}

/** Événement produit explicite. Jamais de PII dans les propriétés. */
export function captureEvent(
  event: string,
  properties?: Record<string, string | number | boolean>,
): void {
  if (key) posthog.capture(event, properties)
}

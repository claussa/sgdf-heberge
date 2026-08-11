import { z } from 'zod'

/**
 * Configuration de l'événement — LE point de rebranding de la plateforme.
 * Tout ce qui est propre à un événement (nom, dates, sites, textes d'accueil, branches)
 * vit ici : ni dans le code, ni dans le schéma DB (le site y est un `String`, pas un enum,
 * pour que changer la liste des sites ne demande aucune migration).
 *
 * Dépendances : Zod uniquement. `@repo/contracts` importe ce package (entorse documentée
 * à la règle §4 du CLAUDE.md : contracts ne dépend que de Zod… et de cette config).
 */

const CoordsSchema = z.object({ lat: z.number(), lng: z.number() })

const EventConfigSchema = z.object({
  /** Nom complet de l'événement (emails, titres de pages) */
  name: z.string().min(1),
  /** Ligne « eyebrow » du header, ex. « Léon XIV · France 2026 · 25-28 septembre » */
  eyebrow: z.string().min(1),
  /** Wordmark de l'app (Caveat Brush dans le header) */
  appName: z.string().min(1),
  organizer: z.string().min(1),
  contactEmail: z.email(),
  dates: z.object({
    /** Premier et dernier jour de l'événement (ISO) */
    start: z.iso.date(),
    end: z.iso.date(),
    /** Libellé humain, ex. « 25-28 septembre 2026 » */
    label: z.string().min(1),
    /** Bornes de saisie des disponibilités/demandes (marge autour de l'événement) */
    inputMin: z.iso.date(),
    inputMax: z.iso.date(),
  }),
  sites: z
    .array(
      z.object({
        slug: z.string().regex(/^[a-z0-9-]+$/),
        label: z.string().min(1),
        coords: CoordsSchema,
      }),
    )
    .min(1),
  /** Panneau gauche de l'écran de connexion */
  /** Adresse postale de l'organisateur — pied de page des emails (délivrabilité/anti-spam) */
  organizerAddress: z.string().min(1),
  hero: z.object({ title: z.string().min(1), text: z.string().min(1) }),
  /** Mentions légales (page /mentions-legales) — propre à l'organisme éditeur */
  legal: z.object({
    /** Raison sociale de l'éditeur */
    legalName: z.string().min(1),
    /** Forme juridique, ex. « association loi 1901 reconnue d'utilité publique » */
    legalForm: z.string().min(1),
    siren: z.string().min(1),
    ape: z.string().min(1),
    /** Adresse du siège social */
    address: z.string().min(1),
    phone: z.string().min(1),
    /** Mention légalement obligatoire — null tant que la personne n'est pas désignée */
    publicationDirector: z.string().min(1).nullable(),
    /** Contact général de la plateforme (distinct du contactEmail des emails) */
    contactEmail: z.email(),
    dpoEmail: z.email(),
  }),
  /** Branches proposées au profil des unités scoutes (spécifique à l'organisateur) */
  unitBranches: z.array(z.string().min(1)).min(1),
  /** Noms de fichiers dans apps/web/src/assets/ */
  assets: z.object({
    logoHorizontal: z.string(),
    logoSymbole: z.string(),
    logoVertical: z.string(),
    logoEvent: z.string(),
    favicon: z.string(),
  }),
})

export type EventConfig = z.infer<typeof EventConfigSchema>

export const eventConfig = {
  name: 'Venue du pape Léon XIV en France',
  eyebrow: 'Léon XIV · France 2026 · 25-28 septembre',
  appName: 'Hébergement',
  organizer: 'Scouts et Guides de France',
  contactEmail: 'communication@sgdf.fr',
  organizerAddress: '65 rue de la Glacière, 75013 Paris',
  dates: {
    start: '2026-09-25',
    end: '2026-09-28',
    label: '25-28 septembre 2026',
    inputMin: '2026-09-20',
    inputMax: '2026-10-02',
  },
  sites: [
    { slug: 'lourdes', label: 'Lourdes', coords: { lat: 43.0983, lng: -0.0508 } },
    { slug: 'paris', label: 'Paris', coords: { lat: 48.853, lng: 2.3499 } },
    { slug: 'metz', label: 'Metz', coords: { lat: 49.1203, lng: 6.1778 } },
  ],
  legal: {
    legalName: 'Scouts et Guides de France',
    legalForm: "association loi 1901 reconnue d'utilité publique",
    siren: '775 682 024',
    ape: '9329Z',
    address: 'Immeuble le Baudran – Bâtiment D, 21-37 rue de Stalingrad, 94110 Arcueil',
    phone: '01 44 52 37 37',
    // Président de l'association, comme sur sgdf.fr
    publicationDirector: 'Charles Le Gac',
    contactEmail: 'auservicedupape@sgdf.fr',
    dpoEmail: 'dpo@sgdf.fr',
  },
  hero: {
    title: 'Un toit pour chaque bénévole,',
    text: 'Trouver où dormir — ou accueillir ceux qui viennent — pour la venue du pape Léon XIV, du 25 au 28 septembre 2026.',
  },
  unitBranches: [
    'Farfadets',
    'Louveteaux-Jeannettes',
    'Scouts-Guides',
    'Pionniers-Caravelles',
    'Compagnons',
    'Vent du large',
  ],
  assets: {
    logoHorizontal: 'sgdf-horizontal-blue.png',
    logoSymbole: 'sgdf-symbole-blue.png',
    logoVertical: 'sgdf-vertical-white.png',
    logoEvent: 'pape-leon-xiv-france-2026.png',
    favicon: 'favicon.svg',
  },
} as const satisfies EventConfig

// Validation fail-fast au chargement : une config invalide ne doit jamais démarrer.
EventConfigSchema.parse(eventConfig)

type ConfiguredSite = (typeof eventConfig.sites)[number]
export type SiteSlug = ConfiguredSite['slug']

/** Slugs des sites, dérivés de la config (cast : Zod exige un tuple de littéraux). */
export const SITE_SLUGS = eventConfig.sites.map((s) => s.slug) as unknown as [
  SiteSlug,
  ...SiteSlug[],
]

/** Schéma Zod d'un site valide — consommé par @repo/contracts et l'API. */
export const SiteSchema = z.enum(SITE_SLUGS)

export function siteBySlug(slug: string): ConfiguredSite | undefined {
  return eventConfig.sites.find((s) => s.slug === slug)
}

export function siteLabel(slug: string): string {
  return siteBySlug(slug)?.label ?? slug
}

const MONTHS_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]
const MONTHS_LONG = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

function dayMonth(iso: string): { day: number; month: number } {
  const [, m, d] = iso.split('-')
  return { day: Number(d), month: Number(m) - 1 }
}

/** « 24 → 29 sept. » — format court de la maquette (cartes, champs). */
export function formatDateRangeShort(fromIso: string, toIso: string): string {
  const from = dayMonth(fromIso)
  const to = dayMonth(toIso)
  if (from.month === to.month) return `${from.day} → ${to.day} ${MONTHS_SHORT[to.month]}`
  return `${from.day} ${MONTHS_SHORT[from.month]} → ${to.day} ${MONTHS_SHORT[to.month]}`
}

/** « du 24 au 29 septembre » — format long de la maquette (sous-titres, prose). */
export function formatDateRangeLong(fromIso: string, toIso: string): string {
  const from = dayMonth(fromIso)
  const to = dayMonth(toIso)
  if (from.month === to.month) return `du ${from.day} au ${to.day} ${MONTHS_LONG[to.month]}`
  return `du ${from.day} ${MONTHS_LONG[from.month]} au ${to.day} ${MONTHS_LONG[to.month]}`
}

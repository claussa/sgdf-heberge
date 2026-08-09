import type { Me } from '@repo/contracts'
import { eventConfig } from '@repo/event-config'
import type { SigneName } from '../ui'

export type NavItem = {
  to: string
  /** Libellé long — nav horizontale desktop */
  label: string
  /** Libellé court — bottom nav mobile (B.9), distinct par item */
  short: string
  /** Icône de la bottom nav mobile */
  signe: SigneName
  /**
   * Chemins couverts par l'état actif : exact, ou préfixe (sous-routes).
   * Le plus long préfixe correspondant gagne (« /unite/annonce » bat « /unite »).
   */
  match: string[]
  /** Desktop uniquement (Admin) — absent de la bottom nav mobile */
  desktopOnly?: boolean
}

/**
 * Navigation par type de compte (B.9). Retourne [] si non connecté ou pas encore
 * onboardé : ni nav horizontale, ni bottom nav sur connexion et inscription (A.0).
 */
export function buildNav(me: Me | null): NavItem[] {
  if (!me?.accountType) return []

  const items: NavItem[] =
    me.accountType === 'INDIVIDUAL'
      ? [
          {
            to: '/recherche',
            label: 'Rechercher un logement',
            short: 'Rechercher',
            signe: 'fleche',
            match: ['/recherche', '/logements'],
          },
          {
            to: '/mes-demandes',
            label: 'Mes demandes',
            short: 'Demandes',
            signe: 'tente',
            match: ['/mes-demandes'],
          },
          // Espace hébergeur : fusionné dans la nav dès qu'un logement existe
          ...(me.hasListings
            ? ([
                {
                  to: '/hebergeur/demandes',
                  label: 'Demandes reçues',
                  short: 'Reçues',
                  signe: 'tente',
                  match: ['/hebergeur/demandes'],
                },
                {
                  to: '/hebergeur/logements',
                  label: 'Mes logements',
                  short: 'Logements',
                  signe: 'campement',
                  match: ['/hebergeur/logements'],
                },
              ] satisfies NavItem[])
            : []),
          {
            to: '/profil',
            label: 'Mon profil',
            short: 'Profil',
            signe: 'etoile',
            match: ['/profil', '/hebergeur'],
          },
        ]
      : [
          {
            to: '/jumelage',
            label: 'Jumelage',
            short: 'Jumelage',
            signe: 'paix',
            match: ['/jumelage'],
          },
          {
            to: '/unite/relations',
            label: 'Demandes reçues',
            short: 'Demandes',
            signe: 'tente',
            match: ['/unite/relations'],
          },
          {
            to: '/unite/annonce',
            label: 'Notre annonce',
            short: 'Annonce',
            signe: 'campement',
            match: ['/unite/annonce'],
          },
          {
            to: '/unite',
            label: 'Notre unité',
            short: 'Unité',
            signe: 'etoile',
            match: ['/unite'],
          },
        ]

  if (me.role === 'ADMIN') {
    items.push({
      to: '/admin',
      label: 'Admin',
      short: 'Admin',
      signe: 'promesse',
      match: ['/admin'],
      desktopOnly: true,
    })
  }
  return items
}

function matchLength(pattern: string, pathname: string): number {
  if (pathname === pattern || pathname.startsWith(`${pattern}/`)) return pattern.length
  return 0
}

/** Index de l'item actif (plus long préfixe gagnant), ou -1. */
export function activeNavIndex(items: NavItem[], pathname: string): number {
  let best = -1
  let bestLength = 0
  items.forEach((item, index) => {
    for (const pattern of item.match) {
      const length = matchLength(pattern, pathname)
      if (length > bestLength) {
        bestLength = length
        best = index
      }
    }
  })
  return best
}

/**
 * Titres d'écran du header mobile (A.0). Un motif « /xxx/* » ne couvre que les
 * sous-routes (fiches) ; le plus long motif gagne.
 */
const SCREEN_TITLES: Array<[string, string]> = [
  ['/connexion', 'Connexion'],
  ['/inscription', 'Inscription'],
  ['/profil', 'Mon profil'],
  ['/hebergeur', 'Mon profil'],
  ['/hebergeur/demandes', 'Demandes reçues'],
  ['/hebergeur/logements', 'Mes logements'],
  ['/hebergeur/logements/nouveau', 'Nouveau logement'],
  ['/recherche', 'Rechercher'],
  ['/logements/*', 'Logement'],
  ['/mes-demandes', 'Mes demandes'],
  ['/unite', 'Notre unité'],
  ['/unite/annonce', 'Notre annonce'],
  ['/unite/relations', 'Demandes'],
  ['/jumelage', 'Jumelage'],
  ['/jumelage/*', 'Unité'],
  ['/admin', 'Admin'],
]

export function screenTitle(pathname: string): string {
  let best: string = eventConfig.appName
  let bestLength = 0
  for (const [pattern, title] of SCREEN_TITLES) {
    const length = pattern.endsWith('/*')
      ? pathname.startsWith(`${pattern.slice(0, -2)}/`)
        ? pattern.length
        : 0
      : matchLength(pattern, pathname)
    if (length > bestLength) {
      bestLength = length
      best = title
    }
  }
  return best
}

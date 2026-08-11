import type { AccessCriterion } from '@repo/contracts'

/**
 * Libellés français des 8 critères d'accessibilité (rapport A.11 — grille relue par
 * une ergothérapeute). Rendu type : <b>{label}</b> — {precision}.
 * Partagé entre le profil volontaire (besoins) et le formulaire logement (étape 2/2).
 */
export const ACCESS_CRITERIA_LABELS: Record<
  AccessCriterion,
  { label: string; precision?: string }
> = {
  pmr: {
    label: 'Accessible en fauteuil roulant',
    precision: 'aucune marche, passages larges, sanitaires adaptés',
  },
  electricWheelchair: {
    label: 'Fauteuil roulant électrique',
    precision: 'lieu de recharge avec un espace suffisant',
  },
  fewSteps: {
    label: 'Peu d’obstacles',
    precision: 'quelques marches, pas de long escalier',
  },
  humanHelp: {
    label: 'Aide humaine possible, soin à proximité',
    precision: 'possibilité d’aide, centre de soin proche',
  },
  transport: {
    label: 'Facile d’accès en transports',
    precision: 'transports et commerces accessibles',
  },
  parking: {
    label: 'Stationnement à proximité',
    precision: 'dépose ou place PMR proche de l’entrée',
  },
  assistanceDog: {
    label: 'Chien d’assistance accepté',
  },
  quiet: {
    label: 'Environnement calme',
    precision: 'cadre apaisant (handicap sensoriel, cognitif)',
  },
}

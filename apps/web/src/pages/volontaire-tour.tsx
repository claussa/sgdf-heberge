import type { RequestRequesterView } from '@repo/contracts'
import { eventConfig } from '@repo/event-config'
import type { DriveStep } from 'driver.js'
import { type NavigateFunction, useNavigate } from 'react-router'
import { useMe } from '../lib/hooks'
import { captureEvent } from '../lib/posthog'
import {
  appCenterAnchor,
  centerPopoverOnFrame,
  createTourDriver,
  createTourStore,
  useTourInvite,
} from './tour-lib'

/**
 * Tour guidé de l'espace volontaire (driver.js), proposé une seule fois sur
 * « Où dormiras-tu ? » — la page où redirige l'onboarding « Je cherche un
 * logement ». Le parcours montre la recherche (filtres, dont « Compatibles avec
 * mes besoins »), puis « Mes demandes » avec une demande d'exemple injectée côté
 * client (jamais envoyée à l'API) pour expliquer le suivi, l'expiration à 7 jours
 * et le plafond de 3 demandes en attente. Le résultat est persisté sur
 * User.seekerTourStatus : SKIPPED (refus ou abandon) ou DONE.
 * Infrastructure commune aux deux tours : tour-lib.tsx.
 */

// ---------------------------------------------------------------------------
// Store — la page Mes demandes s'y abonne pour injecter l'exemple
// ---------------------------------------------------------------------------

type TourState = {
  /** Tour en cours : MesDemandes injecte la demande d'exemple */
  active: boolean
}

const store = createTourStore<TourState>({ active: false })

export function useVolontaireTour(): TourState {
  return store.useTourState()
}

// ---------------------------------------------------------------------------
// Demande d'exemple — construite localement, jamais persistée
// ---------------------------------------------------------------------------

export const SEEKER_TOUR_REQUEST_ID = 'tour-demande-exemple-volontaire'

const DAY_MS = 86_400_000

/** Demande fictive « en attente » affichée pendant le tour, calée sur le profil. */
export function buildSeekerTourRequest(groupSize: number | null): RequestRequesterView {
  const now = new Date()
  return {
    id: SEEKER_TOUR_REQUEST_ID,
    dateFrom: eventConfig.dates.start,
    dateTo: eventConfig.dates.end,
    peopleCount: groupSize ?? 1,
    status: 'PENDING',
    effectiveStatus: 'PENDING',
    awaitingSide: 'HOST',
    lastActivityAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * DAY_MS).toISOString(),
    createdAt: now.toISOString(),
    messages: [],
    listing: {
      id: SEEKER_TOUR_REQUEST_ID,
      title: 'Chambre privée · 2 places',
      displayArea: `${eventConfig.sites[0].label} centre`,
      site: eventConfig.sites[0].slug,
      category: 'PRIVATE',
    },
    hostDisplayName: 'chez Camille E.',
  }
}

// ---------------------------------------------------------------------------
// Le tour lui-même
// ---------------------------------------------------------------------------

export function startVolontaireTour(options: {
  navigate: NavigateFunction
  /** Le chip « Compatibles avec mes besoins » existe (besoins déclarés au profil) */
  hasNeedsFilter: boolean
}): void {
  const { navigate, hasNeedsFilter } = options
  if (store.get().active) return
  store.set({ active: true })
  captureEvent('seeker_tour_started')

  const steps: DriveStep[] = [
    {
      element: '.recherche__filtres',
      popover: {
        title: 'Cherche là où tu seras',
        description:
          'Site, dates, nombre de personnes, type de couchage : les résultats se ' +
          'mettent à jour à chaque réglage. Tes filtres restent posés si tu ouvres ' +
          'une fiche et reviens.',
      },
    },
    hasNeedsFilter
      ? {
          element: '[data-tour="filtre-besoins"]',
          popover: {
            title: 'Compatibles avec tes besoins',
            description:
              'Tu as indiqué des besoins d’accessibilité dans ton profil : ce filtre ' +
              'ne garde que les logements qui les couvrent tous.',
          },
        }
      : {
          element: '[data-tour="filtres-type"]',
          popover: {
            title: 'Compatibles avec tes besoins',
            description:
              'Si tu renseignes des besoins d’accessibilité dans ton profil, un filtre ' +
              '« Compatibles avec mes besoins » apparaît ici et ne garde que les ' +
              'logements qui les couvrent tous.',
          },
        },
    {
      element: '[data-tour="resultats"]',
      popover: {
        title: 'Les logements disponibles',
        description:
          'Clique sur une carte pour ouvrir la fiche et demander à dormir là. Seul le ' +
          'quartier est affiché — l’adresse complète t’est transmise quand l’hébergeur ' +
          'accepte.',
        onNextClick: () => {
          navigate('/mes-demandes')
          tourDriver.moveNext()
        },
      },
    },
    {
      element: '.mes-demandes .tabs',
      popover: {
        title: 'Suis tes demandes ici',
        description:
          'Chaque demande envoyée arrive sur cette page, avec son statut : en attente, ' +
          'acceptée, refusée ou expirée. Tu reçois un e-mail dès qu’un hébergeur répond.',
      },
    },
    {
      element: '[data-tour="demo-card"]',
      popover: {
        title: 'Une demande en attente',
        description:
          'L’hébergeur a 7 jours pour répondre, sinon la demande expire. S’il te pose ' +
          'une question, tu y réponds ici — et le délai repart à 7 jours. Celle-ci est ' +
          'un exemple, le temps de la visite.',
      },
    },
    {
      element: '[data-tour="demo-cancel"]',
      popover: {
        title: '3 demandes en attente, pas plus',
        description:
          'Pour en envoyer une autre, annule-en une ici ou attends une réponse. Et dès ' +
          'qu’un hébergeur accepte, tes autres demandes en attente sont annulées ' +
          'automatiquement — aucun hébergeur ne reste suspendu à ta réponse.',
      },
    },
    {
      element: appCenterAnchor,
      popover: {
        title: 'C’est tout !',
        description:
          'Quand une demande est acceptée, l’adresse complète et le téléphone de ' +
          'l’hébergeur apparaissent dans « Acceptées ». Bonne recherche !',
        popoverClass: 'tour-popover tour-modal',
        onPopoverRender: centerPopoverOnFrame,
        onNextClick: () => {
          // Retour à la recherche : la page Mes demandes redevient vide sans l'exemple.
          finishTour()
          navigate('/recherche')
        },
      },
    },
  ]

  const { tourDriver, finishTour } = createTourDriver({
    steps,
    statusField: 'seekerTourStatus',
    eventPrefix: 'seeker_tour',
    onReset: () => store.set({ active: false }),
  })
  tourDriver.drive()
}

// ---------------------------------------------------------------------------
// Proposition — popup driver.js en mode modal sur « Où dormiras-tu ? »
// ---------------------------------------------------------------------------

/**
 * Propose le tour quand il n'a jamais été proposé (seekerTourStatus null), pour un
 * compte INDIVIDUAL dont l'espace volontaire est ouvert — l'onboarding « Je cherche
 * un logement » redirige vers la recherche, donc juste après l'inscription.
 */
export function useVolontaireTourProposal(): void {
  const navigate = useNavigate()
  const { me } = useMe()
  const { active } = useVolontaireTour()
  const hasNeedsFilter = me !== null && me.accessibilityNeeds.length > 0
  useTourInvite({
    enabled:
      !active &&
      me?.accountType === 'INDIVIDUAL' &&
      me.seeksAccommodation &&
      me.seekerTourStatus === null,
    statusField: 'seekerTourStatus',
    eventPrefix: 'seeker_tour',
    title: 'Bienvenue !',
    description:
      'Ici, tu cherches un toit chez un hébergeur bénévole. On te fait visiter ? ' +
      'Deux minutes pour voir comment chercher, demander, et suivre tes demandes.',
    onAccept: () => startVolontaireTour({ navigate, hasNeedsFilter }),
  })
}

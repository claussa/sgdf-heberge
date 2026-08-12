import type { MyListing, RequestHostView } from '@repo/contracts'
import type { Driver, DriveStep } from 'driver.js'
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
 * Tour guidé de l'espace hébergeur (driver.js), proposé une seule fois sur
 * « Mes logements » — donc juste après la création du premier logement, qui y
 * redirige. Le parcours traverse « Demandes reçues » (avec une demande d'exemple
 * injectée côté client, jamais envoyée à l'API) puis le profil. Le résultat est
 * persisté sur User.hostTourStatus : SKIPPED (refus ou abandon) ou DONE.
 * Infrastructure commune aux deux tours : tour-lib.tsx.
 */

// ---------------------------------------------------------------------------
// Store — la page Demandes s'y abonne pour injecter l'exemple
// ---------------------------------------------------------------------------

type TourState = {
  /** Tour en cours : HebergeurDemandes injecte la demande d'exemple */
  active: boolean
  /** La demande d'exemple a été « acceptée » — elle passe dans l'onglet Acceptées */
  demoAccepted: boolean
}

const store = createTourStore<TourState>({ active: false, demoAccepted: false })

export function useHebergeurTour(): TourState {
  return store.useTourState()
}

// ---------------------------------------------------------------------------
// Demande d'exemple — construite localement, jamais persistée
// ---------------------------------------------------------------------------

export const TOUR_REQUEST_ID = 'tour-demande-exemple'

const DAY_MS = 86_400_000

/** Demande fictive affichée pendant le tour, calée sur le premier logement. */
export function buildTourRequest(
  listing: MyListing | undefined,
  accepted: boolean,
): RequestHostView {
  const now = new Date()
  const status = accepted ? ('ACCEPTED' as const) : ('PENDING' as const)
  return {
    id: TOUR_REQUEST_ID,
    dateFrom: listing?.availableFrom ?? now.toISOString().slice(0, 10),
    dateTo: listing?.availableTo ?? new Date(now.getTime() + 3 * DAY_MS).toISOString().slice(0, 10),
    peopleCount: listing !== undefined && listing.capacity < 2 ? 1 : 2,
    status,
    effectiveStatus: status,
    awaitingSide: 'HOST',
    lastActivityAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * DAY_MS).toISOString(),
    createdAt: now.toISOString(),
    messages: [
      {
        id: `${TOUR_REQUEST_ID}-message`,
        from: 'REQUESTER',
        body:
          'Bonjour ! Nous venons donner un coup de main au service accueil. ' +
          'Serait-il possible de dormir chez toi ces nuits-là ?',
        createdAt: now.toISOString(),
      },
    ],
    listingId: listing?.id ?? TOUR_REQUEST_ID,
    listingTitle: listing?.title ?? 'ton logement',
    requester: {
      firstName: 'Camille',
      lastName: 'Exemple',
      phone: '06 12 34 56 78',
      needs: [],
    },
    overCapacity: false,
  }
}

// ---------------------------------------------------------------------------
// Le tour lui-même
// ---------------------------------------------------------------------------

let activeDriver: Driver | null = null

/** Bouton « Accepter » de la demande d'exemple : avance le tour, aucun appel API. */
export function acceptTourDemo(): void {
  if (!store.get().active || store.get().demoAccepted) return
  store.set({ demoAccepted: true })
  // waitForElement (config) attend la carte « Acceptée » que React va rendre.
  activeDriver?.moveNext()
}

export function startHebergeurTour(options: {
  navigate: NavigateFunction
  /** Étape « active ton espace volontaire » — inutile si l'espace est déjà ouvert */
  includeSeekerStep: boolean
}): void {
  const { navigate, includeSeekerStep } = options
  if (store.get().active) return
  store.set({ active: true, demoAccepted: false })
  captureEvent('host_tour_started')

  const steps: DriveStep[] = [
    {
      element: '.demandes .tabs',
      popover: {
        title: 'Tes demandes arrivent ici',
        description:
          'Chaque volontaire ou participant qui veut dormir chez toi envoie une demande, ' +
          'et elle arrive sur cette page. Tu reçois aussi un e-mail à chaque nouvelle ' +
          'demande — pas besoin de guetter.',
      },
    },
    {
      element: '[data-tour="demo-card"]',
      popover: {
        title: 'Une demande, à quoi ça ressemble',
        description:
          'Qui vient, à combien, pour quelles dates, avec un petit message. ' +
          'Celle-ci est un exemple, le temps de la visite.',
      },
    },
    {
      element: '[data-tour="demo-contact"]',
      popover: {
        title: 'Son téléphone, dès la demande',
        description:
          'C’est à toi de contacter la personne pour faire connaissance — elle ne peut ' +
          'pas t’écrire en dehors de sa demande.',
      },
    },
    {
      element: '[data-tour="demo-actions"]',
      popover: {
        title: 'Trois réponses possibles',
        description:
          'Accepter, poser une question — le délai repart alors à 7 jours —, ou refuser. ' +
          'Sans réponse pendant 7 jours, la demande expire : réponds, même pour refuser.',
      },
    },
    {
      element: '[data-tour="demo-accept"]',
      disableActiveInteraction: false,
      popover: {
        title: 'À toi de jouer',
        description: 'Accepte cette demande d’exemple pour voir la suite — rien n’est envoyé.',
        onNextClick: () => acceptTourDemo(),
      },
    },
    {
      element: '[data-tour="demo-accepted"]',
      popover: {
        title: 'Coordonnées échangées',
        description:
          'La demande passe dans « Acceptées » : Camille recevrait ton adresse complète et ' +
          'ton téléphone, et ses autres demandes seraient annulées automatiquement.',
      },
    },
    {
      element: '.tour-dispo',
      popover: {
        title: 'Complet ? Tu décides',
        description:
          'À tout moment, passe un logement en « Complet » pour le sortir des recherches — ' +
          'ça n’annule rien de ce qui est déjà accepté.',
        ...(includeSeekerStep
          ? {
              onNextClick: () => {
                navigate('/hebergeur')
                tourDriver.moveNext()
              },
            }
          : {}),
      },
    },
    ...(includeSeekerStep
      ? [
          {
            element: '[data-tour="open-seeker"]',
            popover: {
              title: 'Toi aussi, tu pars ?',
              description:
                'Ton profil est ici. Et si tu cherches un logement sur un autre site, ce ' +
                'bouton ouvre ton espace volontaire — même compte, même connexion.',
            },
          } satisfies DriveStep,
        ]
      : []),
    {
      element: appCenterAnchor,
      popover: {
        title: 'C’est tout !',
        description:
          'Merci d’ouvrir ta porte. Réponds aux demandes quand elles arrivent : un e-mail ' +
          'te préviendra à chaque fois. Bon accueil !',
        popoverClass: 'tour-popover tour-modal',
        onPopoverRender: centerPopoverOnFrame,
        onNextClick: () => finishTour(),
      },
    },
  ]

  const { tourDriver, finishTour } = createTourDriver({
    steps,
    statusField: 'hostTourStatus',
    eventPrefix: 'host_tour',
    onReset: () => {
      activeDriver = null
      store.set({ active: false, demoAccepted: false })
    },
  })
  activeDriver = tourDriver
  // L'état est posé AVANT de naviguer : la page Demandes monte avec l'exemple.
  navigate('/hebergeur/demandes')
  tourDriver.drive()
}

// ---------------------------------------------------------------------------
// Proposition — popup driver.js en mode modal sur « Mes logements »
// ---------------------------------------------------------------------------

/**
 * Propose le tour quand il n'a jamais été proposé (hostTourStatus null), pour un
 * compte INDIVIDUAL avec au moins un logement. `hasListings` vient de la requête
 * /my/listings de la page — pas de me.hasListings, qui peut être périmé juste
 * après la création du premier logement.
 */
export function useHebergeurTourProposal(hasListings: boolean): void {
  const navigate = useNavigate()
  const { me } = useMe()
  const { active } = useHebergeurTour()
  const includeSeekerStep = me !== null && !me.seeksAccommodation
  useTourInvite({
    enabled:
      hasListings && !active && me?.accountType === 'INDIVIDUAL' && me.hostTourStatus === null,
    statusField: 'hostTourStatus',
    eventPrefix: 'host_tour',
    title: 'Ton logement est en ligne !',
    description:
      'Merci d’ouvrir ta porte. On te fait visiter ? Deux minutes pour voir comment ' +
      'les demandes arrivent, et comment y répondre.',
    onAccept: () => startHebergeurTour({ navigate, includeSeekerStep }),
  })
}

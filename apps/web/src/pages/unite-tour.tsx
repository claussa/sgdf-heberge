import type { JumelageAd, JumelageKind, JumelageReceivedContact } from '@repo/contracts'
import { eventConfig, formatDateRangeShort, type SiteSlug } from '@repo/event-config'
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
 * Tour guidé de l'espace unité (driver.js), proposé une seule fois sur « Jumelage »
 * — la liste des unités, où redirige la publication de l'annonce. UN SEUL tour pour
 * les deux sens d'annonce : chercher un jumelage ou pouvoir jumeler traversent la
 * même interface, seul le wording s'adapte au sens (kind) de notre annonce.
 * Le parcours montre la liste des unités du sens opposé (avec une annonce d'exemple
 * injectée côté client), puis « Demandes de mise en relation » avec une demande
 * d'exemple à accepter (jamais envoyée à l'API) pour expliquer l'échange de
 * coordonnées, et finit sur le retrait d'annonce. Le résultat est persisté sur
 * User.unitTourStatus : SKIPPED (refus ou abandon) ou DONE.
 * Infrastructure commune aux trois tours : tour-lib.tsx.
 */

// ---------------------------------------------------------------------------
// Store — Jumelage (liste) et UniteRelations s'y abonnent pour les exemples
// ---------------------------------------------------------------------------

type TourState = {
  /** Tour en cours : la liste et les demandes injectent leurs exemples */
  active: boolean
  /** La demande d'exemple a été « acceptée » — coordonnées d'exemple affichées */
  demoAccepted: boolean
}

const store = createTourStore<TourState>({ active: false, demoAccepted: false })

export function useUniteTour(): TourState {
  return store.useTourState()
}

// ---------------------------------------------------------------------------
// Exemples — construits localement, jamais persistés
// ---------------------------------------------------------------------------

export const UNITE_TOUR_AD_ID = 'tour-annonce-exemple-unite'
export const UNITE_TOUR_CONTACT_ID = 'tour-demande-exemple-unite'

/** Nom de l'unité fictive qui traverse tout le tour (annonce puis demande). */
const DEMO_UNIT = { unitName: '1re Exemple', unitBranch: eventConfig.unitBranches[0] }

/** Effectif d'exemple selon le sens de l'annonce (mêmes repères que les placeholders A.13). */
function demoPeopleLabel(kind: JumelageKind): string {
  return kind === 'HOSTING' ? '30 personnes' : '18 jeunes + 3 chefs'
}

/** Annonce fictive du sens OPPOSÉ au nôtre, affichée en tête de liste pendant le tour. */
export function buildUniteTourAd(kind: JumelageKind, site: SiteSlug): JumelageAd {
  return {
    id: UNITE_TOUR_AD_ID,
    kind,
    site,
    dateFrom: eventConfig.dates.start,
    dateTo: eventConfig.dates.end,
    peopleLabel: demoPeopleLabel(kind),
    description: null,
    ...DEMO_UNIT,
    createdAt: new Date().toISOString(),
  }
}

/** Demande fictive envoyée par la 1re Exemple (sens opposé au nôtre) sur NOTRE annonce. */
export function buildUniteTourContact(
  myKind: JumelageKind,
  accepted: boolean,
): JumelageReceivedContact {
  const theirKind: JumelageKind = myKind === 'SEEKING' ? 'HOSTING' : 'SEEKING'
  const base = {
    id: UNITE_TOUR_CONTACT_ID,
    ...DEMO_UNIT,
    peopleLabel: demoPeopleLabel(theirKind),
    dates: formatDateRangeShort(eventConfig.dates.start, eventConfig.dates.end),
    message:
      myKind === 'SEEKING'
        ? 'Bonjour ! Notre local est libre ces dates-là, nous serions heureux d’accueillir votre unité.'
        : 'Bonjour ! Nous cherchons encore où dormir, et votre annonce correspond tout à fait à notre groupe.',
    createdAt: new Date().toISOString(),
  }
  return accepted
    ? {
        ...base,
        status: 'ACCEPTED',
        contact: { name: 'Camille Exemple', email: 'camille@exemple.fr', phone: '06 12 34 56 78' },
      }
    : { ...base, status: 'PENDING' }
}

// ---------------------------------------------------------------------------
// Le tour lui-même
// ---------------------------------------------------------------------------

let activeDriver: Driver | null = null

/** Bouton « Accepter » de la demande d'exemple : avance le tour, aucun appel API. */
export function acceptUniteTourDemo(): void {
  if (!store.get().active || store.get().demoAccepted) return
  store.set({ demoAccepted: true })
  // waitForElement (config) attend la carte « En relation » que React va rendre.
  activeDriver?.moveNext()
}

export function startUniteTour(options: {
  navigate: NavigateFunction
  /** Sens de NOTRE annonce — pilote tout le wording du tour */
  kind: JumelageKind
}): void {
  const { navigate, kind } = options
  if (store.get().active) return
  store.set({ active: true, demoAccepted: false })
  captureEvent('unit_tour_started')
  const seeking = kind === 'SEEKING'

  const steps: DriveStep[] = [
    {
      element: '[data-tour="unites"]',
      popover: {
        title: seeking
          ? 'Les unités qui peuvent vous jumeler'
          : 'Les unités qui cherchent un jumelage',
        description: seeking
          ? 'Les annonces des unités de votre site prêtes à accueillir la vôtre : ' +
            'jusqu’à combien de personnes, sur quelles dates. La liste s’étoffe au ' +
            'fil des annonces publiées.'
          : 'Les annonces des unités qui cherchent un jumelage sur votre site : à ' +
            'combien elles seront, sur quelles dates. La liste s’étoffe au fil des ' +
            'annonces publiées.',
      },
    },
    {
      element: '[data-tour="demo-ad"]',
      popover: {
        title: 'Demander une mise en relation',
        description:
          'Ouvrez la fiche d’une unité pour lui envoyer une demande, avec un petit ' +
          'message de présentation. Celle-ci est un exemple, le temps de la visite.',
        onNextClick: () => {
          navigate('/unite/relations')
          tourDriver.moveNext()
        },
      },
    },
    {
      element: '.ja-relations .tabs',
      popover: {
        title: 'Les demandes reçues arrivent ici',
        description:
          'La mise en relation marche dans les deux sens : les unités qui voient ' +
          'votre annonce peuvent aussi vous écrire. Leurs demandes arrivent sur cette ' +
          'page, et vous recevez un e-mail à chaque fois — pas besoin de guetter.',
      },
    },
    {
      element: '[data-tour="demo-card"]',
      popover: {
        title: 'Une demande, à quoi ça ressemble',
        description: seeking
          ? 'Qui écrit, combien de personnes l’unité peut jumeler, sur quelles dates, ' +
            'avec un petit mot. Celle-ci est un exemple, le temps de la visite.'
          : 'Qui écrit, à combien ils seront, sur quelles dates, avec un petit mot. ' +
            'Celle-ci est un exemple, le temps de la visite.',
      },
    },
    {
      element: '[data-tour="demo-actions"]',
      popover: {
        title: 'Accepter ou ignorer, jamais refuser',
        description:
          'Une demande que vous n’acceptez pas reste simplement sans suite : ni refus, ' +
          'ni expiration. Et une unité peut être jumelée plusieurs fois — accepter ' +
          'n’enlève rien aux autres.',
      },
    },
    {
      element: '[data-tour="demo-accept"]',
      disableActiveInteraction: false,
      popover: {
        title: 'À vous de jouer',
        description: 'Acceptez cette demande d’exemple pour voir la suite — rien n’est envoyé.',
        onNextClick: () => acceptUniteTourDemo(),
      },
    },
    {
      element: '[data-tour="demo-accepted"]',
      popover: {
        title: 'Coordonnées échangées',
        description:
          'Les deux unités reçoivent chacune l’e-mail et le téléphone du responsable ' +
          'de l’autre. La plateforme s’arrête là : le lieu, le planning et ' +
          'l’organisation se règlent entre vous.',
      },
    },
    {
      element: '[data-withdraw-ad]',
      popover: {
        title: 'Jumelage conclu ?',
        description:
          'Quand votre unité n’attend plus d’autre jumelage, retirez votre annonce ' +
          'pour ne plus recevoir de demandes — les mises en relation acceptées ' +
          'restent acquises, et l’annonce peut être republiée plus tard.',
      },
    },
    {
      element: appCenterAnchor,
      popover: {
        title: 'C’est tout !',
        description: seeking
          ? 'Bonne recherche ! Écrivez aux unités qui peuvent vous jumeler, et ' +
            'répondez aux demandes qui arrivent : un e-mail vous préviendra à ' +
            'chaque fois. Bon jumelage !'
          : 'Merci d’ouvrir votre porte ! Écrivez aux unités qui cherchent, et ' +
            'répondez aux demandes qui arrivent : un e-mail vous préviendra à ' +
            'chaque fois. Bon jumelage !',
        popoverClass: 'tour-popover tour-modal',
        onPopoverRender: centerPopoverOnFrame,
        onNextClick: () => {
          // Retour à la liste : la page Demandes redevient vide sans l'exemple.
          finishTour()
          navigate('/jumelage')
        },
      },
    },
  ]

  const { tourDriver, finishTour } = createTourDriver({
    steps,
    statusField: 'unitTourStatus',
    eventPrefix: 'unit_tour',
    onReset: () => {
      activeDriver = null
      store.set({ active: false, demoAccepted: false })
    },
  })
  activeDriver = tourDriver
  tourDriver.drive()
}

// ---------------------------------------------------------------------------
// Proposition — popup driver.js en mode modal sur « Jumelage » (la liste)
// ---------------------------------------------------------------------------

/**
 * Propose le tour quand il n'a jamais été proposé (unitTourStatus null), pour un
 * compte SCOUT_UNIT avec une annonce ACTIVE — la publication de l'annonce (A.13)
 * redirige vers la liste, donc juste après la mise en ligne. `kind` est le sens de
 * NOTRE annonce, fourni par la page.
 */
export function useUniteTourProposal(kind: JumelageKind): void {
  const navigate = useNavigate()
  const { me } = useMe()
  const { active } = useUniteTour()
  useTourInvite({
    enabled: !active && me?.accountType === 'SCOUT_UNIT' && me.unitTourStatus === null,
    statusField: 'unitTourStatus',
    eventPrefix: 'unit_tour',
    title: 'Votre annonce est en ligne !',
    description:
      'On vous fait visiter ? Deux minutes pour voir comment contacter une unité, ' +
      'suivre les demandes reçues et échanger vos coordonnées.',
    onAccept: () => startUniteTour({ navigate, kind }),
  })
}

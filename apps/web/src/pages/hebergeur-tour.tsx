import type { HostTourStatus, Me, MyListing, RequestHostView } from '@repo/contracts'
import { type Driver, type DriveStep, driver, type PopoverDOM } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useEffect, useSyncExternalStore } from 'react'
import { type NavigateFunction, useNavigate } from 'react-router'
import { api } from '../lib/api'
import { ME_QUERY_KEY, useMe } from '../lib/hooks'
import { captureEvent } from '../lib/posthog'
import { queryClient } from '../lib/query'

/**
 * Tour guidé de l'espace hébergeur (driver.js), proposé une seule fois sur
 * « Mes logements » — donc juste après la création du premier logement, qui y
 * redirige. Le parcours traverse « Demandes reçues » (avec une demande d'exemple
 * injectée côté client, jamais envoyée à l'API) puis le profil. Le résultat est
 * persisté sur User.hostTourStatus : SKIPPED (refus ou abandon) ou DONE.
 */

// ---------------------------------------------------------------------------
// Store minimal (module) — la page Demandes s'y abonne pour injecter l'exemple
// ---------------------------------------------------------------------------

type TourState = {
  /** Tour en cours : HebergeurDemandes injecte la demande d'exemple */
  active: boolean
  /** La demande d'exemple a été « acceptée » — elle passe dans l'onglet Acceptées */
  demoAccepted: boolean
}

let tourState: TourState = { active: false, demoAccepted: false }
const listeners = new Set<() => void>()

function setTourState(patch: Partial<TourState>): void {
  tourState = { ...tourState, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useHebergeurTour(): TourState {
  return useSyncExternalStore(subscribe, () => tourState)
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
// Persistance du résultat — PATCH /me, à sens unique (jamais remis à null)
// ---------------------------------------------------------------------------

function saveTourStatus(status: HostTourStatus): void {
  // Optimiste : la proposition ne doit pas réapparaître si l'utilisateur revient
  // sur « Mes logements » avant la réponse du PATCH.
  queryClient.setQueryData<Me | null>(ME_QUERY_KEY, (me) =>
    me ? { ...me, hostTourStatus: status } : me,
  )
  api.me
    .$patch({ json: { hostTourStatus: status } })
    .then(async (res) => {
      if (res.status === 200) queryClient.setQueryData(ME_QUERY_KEY, await res.json())
    })
    .catch(() => {
      // Hors ligne : au pire, la proposition reviendra à une prochaine session.
    })
}

// ---------------------------------------------------------------------------
// Le tour lui-même
// ---------------------------------------------------------------------------

/**
 * Popovers « modaux » (proposition, étape finale) : driver.js les fige au centre
 * du VIEWPORT — sous le cadre applicatif quand la page est peu remplie. Centre de
 * la partie VISIBLE du cadre (.frame), en coordonnées viewport.
 */
function frameCenter(): { x: number; y: number } {
  const frame = document.querySelector('.frame')?.getBoundingClientRect()
  if (!frame) return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  const top = Math.max(frame.top, 0)
  const bottom = Math.min(frame.bottom, window.innerHeight)
  return {
    x: (Math.max(frame.left, 0) + Math.min(frame.right, window.innerWidth)) / 2,
    y: top + (bottom - top) / 2,
  }
}

/**
 * Ancre des popovers modaux. Sans élément, driver crée un élément fictif au
 * centre du viewport ; on crée le nôtre (même id : driver le réutilise et garde
 * son rendu sans flèche) au centre du cadre — le trou de l'overlay reste ainsi
 * caché sous la popup repositionnée par centerPopoverOnFrame.
 */
function appCenterAnchor(): Element {
  const anchor = document.getElementById('driver-dummy-element') ?? document.createElement('div')
  anchor.id = 'driver-dummy-element'
  const center = frameCenter()
  const style = anchor.style
  style.width = '0'
  style.height = '0'
  style.pointerEvents = 'none'
  style.opacity = '0'
  style.position = 'fixed'
  style.top = `${center.y}px`
  style.left = `${center.x}px`
  if (!anchor.isConnected) document.body.appendChild(anchor)
  return anchor
}

/**
 * En mode « over », driver positionne le wrapper au centre du viewport en styles
 * inline, sans tenir compte de l'élément. La classe .tour-modal reprend la main
 * avec ces variables (règle !important dans hebergeur.css — survit au resize).
 */
function centerPopoverOnFrame(popover: PopoverDOM): void {
  const center = frameCenter()
  popover.wrapper.style.setProperty('--tour-modal-x', `${center.x}px`)
  popover.wrapper.style.setProperty('--tour-modal-y', `${center.y}px`)
}

let activeDriver: Driver | null = null

/** Bouton « Accepter » de la demande d'exemple : avance le tour, aucun appel API. */
export function acceptTourDemo(): void {
  if (!tourState.active || tourState.demoAccepted) return
  setTourState({ demoAccepted: true })
  // waitForElement (config) attend la carte « Acceptée » que React va rendre.
  activeDriver?.moveNext()
}

export function startHebergeurTour(options: {
  navigate: NavigateFunction
  /** Étape « active ton espace volontaire » — inutile si l'espace est déjà ouvert */
  includeSeekerStep: boolean
}): void {
  const { navigate, includeSeekerStep } = options
  if (tourState.active) return
  let finished = false
  setTourState({ active: true, demoAccepted: false })
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
        onNextClick: () => {
          finished = true
          tourDriver.destroy()
        },
      },
    },
  ]

  const tourDriver = driver({
    steps,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'Suivant',
    doneBtnText: 'Terminer',
    // Pas de « Précédent » : les étapes traversent des changements d'onglet et de
    // page, revenir en arrière laisserait des cibles orphelines.
    showButtons: ['next', 'close'],
    stagePadding: 8,
    // Les cibles apparaissent après navigation ou re-render React : attendre.
    waitForElement: 8000,
    // L'élément mis en avant n'est cliquable que là où le tour le demande (étape
    // « Accepter ») — évite un vrai refus ou un « Complet » pendant la visite.
    disableActiveInteraction: true,
    popoverClass: 'tour-popover',
    onDestroyed: () => {
      activeDriver = null
      setTourState({ active: false, demoAccepted: false })
      saveTourStatus(finished ? 'DONE' : 'SKIPPED')
      captureEvent(finished ? 'host_tour_completed' : 'host_tour_abandoned')
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
 * après la création du premier logement. « Non merci », la croix ou un clic sur
 * le fond marquent SKIPPED : la proposition ne revient jamais.
 */
export function useHebergeurTourProposal(hasListings: boolean): void {
  const navigate = useNavigate()
  const { me } = useMe()
  const { active } = useHebergeurTour()
  const shouldPropose =
    hasListings && !active && me?.accountType === 'INDIVIDUAL' && me.hostTourStatus === null
  const includeSeekerStep = me !== null && !me.seeksAccommodation

  useEffect(() => {
    if (!shouldPropose) return
    // Le cleanup (StrictMode, navigation) détruit la popup sans la compter
    // comme un refus : seule une fermeture par l'utilisateur marque SKIPPED.
    let cancelled = false
    let accepted = false
    // Déjà détruite : le cleanup ne doit PAS rappeler destroy() — driver.destroy()
    // n'est pas idempotent, il retirerait la classe body `driver-active` posée
    // entre-temps par le tour, dont l'overlay bloquerait alors tous les clics.
    let closed = false
    const invite = driver({
      showButtons: ['next', 'close'],
      nextBtnText: 'Faire le tour',
      popoverClass: 'tour-popover tour-modal',
      onDestroyed: () => {
        closed = true
        if (cancelled || accepted) return
        saveTourStatus('SKIPPED')
        captureEvent('host_tour_declined')
      },
    })
    invite.highlight({
      element: appCenterAnchor,
      popover: {
        title: 'Ton logement est en ligne !',
        description:
          'Merci d’ouvrir ta porte. On te fait visiter ? Deux minutes pour voir comment ' +
          'les demandes arrivent, et comment y répondre.',
        // En mode highlight(), driver force showButtons à [] : re-déclarer ici
        showButtons: ['next', 'close'],
        onNextClick: () => {
          accepted = true
          invite.destroy()
          startHebergeurTour({ navigate, includeSeekerStep })
        },
        onPopoverRender: (popover) => {
          centerPopoverOnFrame(popover)
          const decline = document.createElement('button')
          decline.type = 'button'
          decline.className = 'tour-invite__decline'
          decline.textContent = 'Non merci'
          decline.addEventListener('click', () => invite.destroy())
          popover.footerButtons.insertBefore(decline, popover.nextButton)
        },
      },
    })
    captureEvent('host_tour_proposed')
    return () => {
      cancelled = true
      if (!closed) invite.destroy()
    }
  }, [shouldPropose, includeSeekerStep, navigate])
}

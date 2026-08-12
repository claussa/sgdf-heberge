import type { Me, TourStatus } from '@repo/contracts'
import { type Driver, type DriveStep, driver, type PopoverDOM } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { api } from '../lib/api'
import { ME_QUERY_KEY } from '../lib/hooks'
import { captureEvent } from '../lib/posthog'
import { queryClient } from '../lib/query'
import './tour.css'

/**
 * Infrastructure commune des tours guidés driver.js (hébergeur : hebergeur-tour.tsx,
 * volontaire : volontaire-tour.tsx, unité : unite-tour.tsx) : store d'état minimal,
 * persistance du résultat sur /me, centrage des popovers modaux sur le cadre
 * applicatif, configuration driver partagée et popup de proposition
 * « On te fait visiter ? ».
 *
 * Pièges driver.js 1.8 contournés ici (documentés en commentaires) :
 * - highlight() force showButtons à [] → re-déclarés dans le popover ;
 * - destroy() non idempotent (retire la classe body `driver-active`) → flag closed ;
 * - les popovers sans élément sont figés au centre du viewport → ancre +
 *   variables CSS pour les centrer sur le cadre applicatif (.frame).
 */

// ---------------------------------------------------------------------------
// Store minimal (module) — les pages s'y abonnent pour injecter les exemples
// ---------------------------------------------------------------------------

export type TourStore<T extends object> = {
  get: () => T
  set: (patch: Partial<T>) => void
  /** Hook React : abonne le composant à l'état du tour */
  useTourState: () => T
}

export function createTourStore<T extends object>(initial: T): TourStore<T> {
  let state = initial
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  return {
    get: () => state,
    set: (patch) => {
      state = { ...state, ...patch }
      for (const listener of listeners) listener()
    },
    useTourState: () => useSyncExternalStore(subscribe, () => state),
  }
}

// ---------------------------------------------------------------------------
// Persistance du résultat — PATCH /me, à sens unique (jamais remis à null)
// ---------------------------------------------------------------------------

export type TourStatusField = 'hostTourStatus' | 'seekerTourStatus' | 'unitTourStatus'

export function saveTourStatus(field: TourStatusField, status: TourStatus): void {
  // Optimiste : la proposition ne doit pas réapparaître si l'utilisateur revient
  // sur la page d'origine avant la réponse du PATCH.
  queryClient.setQueryData<Me | null>(ME_QUERY_KEY, (me) => (me ? { ...me, [field]: status } : me))
  api.me
    .$patch({ json: { [field]: status } })
    .then(async (res) => {
      if (res.status === 200) queryClient.setQueryData(ME_QUERY_KEY, await res.json())
    })
    .catch(() => {
      // Hors ligne : au pire, la proposition reviendra à une prochaine session.
    })
}

// ---------------------------------------------------------------------------
// Popovers modaux — centrés sur le cadre applicatif, pas sur le viewport
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
export function appCenterAnchor(): Element {
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
 * avec ces variables (règle !important dans tour.css — survit au resize).
 */
export function centerPopoverOnFrame(popover: PopoverDOM): void {
  const center = frameCenter()
  popover.wrapper.style.setProperty('--tour-modal-x', `${center.x}px`)
  popover.wrapper.style.setProperty('--tour-modal-y', `${center.y}px`)
}

// ---------------------------------------------------------------------------
// Driver d'un tour — configuration partagée + persistance à la destruction
// ---------------------------------------------------------------------------

export function createTourDriver(options: {
  steps: DriveStep[]
  statusField: TourStatusField
  /** Préfixe des événements PostHog (« host_tour », « seeker_tour ») */
  eventPrefix: string
  /** Remise à zéro du store du tour (appelée à la destruction, quelle qu'en soit la cause) */
  onReset: () => void
}): { tourDriver: Driver; finishTour: () => void } {
  const { steps, statusField, eventPrefix, onReset } = options
  let finished = false
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
    // L'élément mis en avant n'est cliquable que là où le tour le demande —
    // évite une vraie action (refus, annulation…) pendant la visite.
    disableActiveInteraction: true,
    popoverClass: 'tour-popover',
    onDestroyed: () => {
      onReset()
      saveTourStatus(statusField, finished ? 'DONE' : 'SKIPPED')
      captureEvent(finished ? `${eventPrefix}_completed` : `${eventPrefix}_abandoned`)
    },
  })
  return {
    tourDriver,
    finishTour: () => {
      finished = true
      tourDriver.destroy()
    },
  }
}

// ---------------------------------------------------------------------------
// Proposition — popup driver.js en mode modal sur la page d'origine du tour
// ---------------------------------------------------------------------------

/**
 * Propose le tour dès que `enabled` passe à vrai. « Non merci », la croix ou un
 * clic sur le fond marquent SKIPPED : la proposition ne revient jamais. Le cleanup
 * (StrictMode, navigation) détruit la popup sans la compter comme un refus.
 */
export function useTourInvite(options: {
  enabled: boolean
  statusField: TourStatusField
  /** Préfixe des événements PostHog (« host_tour », « seeker_tour ») */
  eventPrefix: string
  title: string
  description: string
  /** Lance le tour — lu via une ref : peut capturer librement l'état du rendu */
  onAccept: () => void
}): void {
  const { enabled, statusField, eventPrefix, title, description } = options
  const onAcceptRef = useRef(options.onAccept)
  onAcceptRef.current = options.onAccept

  useEffect(() => {
    if (!enabled) return
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
        saveTourStatus(statusField, 'SKIPPED')
        captureEvent(`${eventPrefix}_declined`)
      },
    })
    invite.highlight({
      element: appCenterAnchor,
      popover: {
        title,
        description,
        // En mode highlight(), driver force showButtons à [] : re-déclarer ici
        showButtons: ['next', 'close'],
        onNextClick: () => {
          accepted = true
          invite.destroy()
          onAcceptRef.current()
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
    captureEvent(`${eventPrefix}_proposed`)
    return () => {
      cancelled = true
      if (!closed) invite.destroy()
    }
  }, [enabled, statusField, eventPrefix, title, description])
}

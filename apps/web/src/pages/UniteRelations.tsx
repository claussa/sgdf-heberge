import { useMutation, useQueryClient } from '@tanstack/react-query'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { Badge, Button, Card, EmptyState, HelpText, Loading, PageTitle, Tabs } from '../ui'
import { JUMELAGE_ADS_KEY, MY_JUMELAGE_KEY, type MyJumelage, useMyJumelage } from './jumelage-data'
import {
  acceptUniteTourDemo,
  buildUniteTourContact,
  UNITE_TOUR_CONTACT_ID,
  useUniteTour,
} from './unite-tour'
import './jumelage-admin.css'

type Received = MyJumelage['received'][number]

/**
 * La suggestion « Retirer notre annonce » après une acceptation ne doit
 * apparaître qu'une seule fois — mémorisé en localStorage pour survivre aux
 * rechargements.
 */
const WITHDRAW_SUGGESTED_KEY = 'jumelage-withdraw-suggested'

function wasWithdrawSuggested(): boolean {
  try {
    return localStorage.getItem(WITHDRAW_SUGGESTED_KEY) !== null
  } catch {
    return false
  }
}

function markWithdrawSuggested(): void {
  try {
    localStorage.setItem(WITHDRAW_SUGGESTED_KEY, '1')
  } catch {
    // Stockage indisponible (mode privé…) : tant pis, la suggestion pourra revenir.
  }
}
type ReceivedPending = Extract<Received, { status: 'PENDING' }>
type ReceivedAccepted = Extract<Received, { status: 'ACCEPTED' }>

/**
 * /unite/relations — écran A.16 « Demandes de mise en relation, ». Accepter ou
 * ignorer, jamais refuser : une demande non acceptée reste sans suite, et la
 * seule porte de sortie est le retrait de l'annonce.
 */
export function UniteRelations() {
  const [tab, setTab] = useState(0)
  // Demande tout juste acceptée : on suggère de retirer l'annonce si l'unité
  // n'attend plus d'autre jumelage (mise en avant driver.js, une seule fois).
  const [suggestWithdraw, setSuggestWithdraw] = useState(false)
  // true tant que le popover de cette session est ouvert : laisse le garde
  // « déjà montré » survivre aux re-exécutions de l'effet dues aux refetchs.
  const shownThisSession = useRef(false)
  const queryClient = useQueryClient()
  const tour = useUniteTour()
  const { data, isPending, isError } = useMyJumelage()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: MY_JUMELAGE_KEY })
  }

  const accept = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.jumelage.contacts[':id'].accept.$post({ param: { id } })
      // 409 = déjà acceptée (double clic) : le refetch suffit, pas d'erreur à montrer.
      if (res.status !== 200 && res.status !== 409) throw new Error(`accept : ${res.status}`)
      return res.status === 200
    },
    onSuccess: (justAccepted) => {
      if (justAccepted) setSuggestWithdraw(true)
    },
    onSettled: invalidate,
  })

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.jumelage.contacts[':id'].dismiss.$post({ param: { id } })
      if (res.status !== 200) throw new Error(`dismiss : ${res.status}`)
    },
    onSettled: invalidate,
  })

  const withdraw = useMutation({
    mutationFn: async () => {
      const res = await api.my.jumelage.ad.withdraw.$post()
      // 404 = déjà retirée : le refetch remet l'écran d'aplomb.
      if (res.status !== 200 && res.status !== 404) throw new Error(`withdraw : ${res.status}`)
    },
    onSettled: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: JUMELAGE_ADS_KEY })
    },
  })

  const adActive = data?.ad?.status === 'ACTIVE'

  useEffect(() => {
    if (!suggestWithdraw) return
    // Le bouton « Retirer notre annonce » ne vit que dans l'onglet « Reçues ».
    if (tab !== 0) return
    // Rien à suggérer si l'annonce est déjà retirée ; et une seule fois en tout
    // — sauf pour le popover que cette session vient d'ouvrir, qui doit
    // survivre aux re-exécutions de l'effet (refetchs, changement d'onglet).
    if (!adActive || (wasWithdrawSuggested() && !shownThisSession.current)) {
      setSuggestWithdraw(false)
      return
    }
    const element = document.querySelector<HTMLElement>('[data-withdraw-ad]')
    if (!element) return
    markWithdrawSuggested()
    shownThisSession.current = true
    // Le cleanup détruit la mise en avant à chaque refetch (l'effet la recrée
    // aussitôt) : ne vider l'état que si c'est l'utilisateur qui ferme.
    let cancelled = false
    const highlight = driver({
      showButtons: ['close'],
      stagePadding: 8,
      onDestroyed: () => {
        if (!cancelled) setSuggestWithdraw(false)
      },
    })
    highlight.highlight({
      element,
      popover: {
        title: 'Notre annonce est-elle encore utile ?',
        description:
          'Demande acceptée, vos coordonnées sont échangées ! Si votre unité n’attend plus d’autre jumelage, retirez l’annonce pour ne plus recevoir de demandes — les mises en relation acceptées restent acquises.',
        side: 'top',
      },
    })
    return () => {
      cancelled = true
      highlight.destroy()
    }
  }, [suggestWithdraw, adActive, tab])

  if (isPending) return <Loading />
  if (isError || !data) {
    return (
      <p className="alert-text">Impossible de charger les demandes. Réessayez dans un instant.</p>
    )
  }

  // Tour guidé : la demande d'exemple est injectée en tête d'affichage — le
  // wording de l'exemple suit le sens de notre annonce.
  const received = tour.active
    ? [buildUniteTourContact(data.ad?.kind ?? 'SEEKING', tour.demoAccepted), ...data.received]
    : data.received
  const pending = received.filter((c): c is ReceivedPending => c.status === 'PENDING')
  const accepted = received.filter((c): c is ReceivedAccepted => c.status === 'ACCEPTED')
  const busy = accept.isPending || dismiss.isPending || withdraw.isPending
  const actionFailed = accept.isError || dismiss.isError || withdraw.isError

  const onWithdraw = () => {
    const confirmed = window.confirm(
      'Retirer notre annonce ? Les mises en relation déjà acceptées restent acquises.',
    )
    if (confirmed) withdraw.mutate()
  }

  return (
    <div className="ja-col ja-col--680 ja-relations fade">
      <PageTitle>Demandes de mise en relation,</PageTitle>
      <Tabs
        tabs={[
          { label: 'Reçues', count: pending.length },
          { label: 'En relation', count: data.relations.length },
        ]}
        active={tab}
        onChange={setTab}
      />
      {actionFailed && (
        <p className="alert-text">L’action n’a pas abouti. Réessayez dans un instant.</p>
      )}
      {tab === 0 ? (
        <>
          {pending.length === 0 && accepted.length === 0 && (
            <EmptyState>Aucune demande reçue pour l’instant.</EmptyState>
          )}
          {pending.map((contact) => {
            const meta = [contact.peopleLabel, contact.dates].filter(Boolean).join(', ')
            // Demande d'exemple du tour guidé : cibles data-tour pour les popovers,
            // badge explicite, et jamais d'appel API (le tour bloque de toute façon
            // les clics en dehors du bouton « Accepter » de l'étape dédiée).
            const demo = contact.id === UNITE_TOUR_CONTACT_ID
            return (
              <Card
                key={contact.id}
                className="ja-card-stack"
                data-tour={demo ? 'demo-card' : undefined}
              >
                {demo && (
                  <div className="ja-badge-row">
                    <Badge variant="warning">Demande d’exemple</Badge>
                  </div>
                )}
                <p className="ja-card-line">
                  <b>{contact.unitName}</b>
                  {contact.unitBranch ? ` · ${contact.unitBranch}` : ''}
                  {meta ? ` — ${meta}` : ''}
                </p>
                {contact.message && <p className="ja-quote">« {contact.message} »</p>}
                <div className="ja-actions" data-tour={demo ? 'demo-actions' : undefined}>
                  <Button
                    size="sm"
                    data-tour={demo ? 'demo-accept' : undefined}
                    onClick={() => (demo ? acceptUniteTourDemo() : accept.mutate(contact.id))}
                    disabled={busy}
                  >
                    Accepter et échanger nos contacts
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (!demo) dismiss.mutate(contact.id)
                    }}
                    disabled={busy}
                  >
                    Ignorer
                  </Button>
                </div>
              </Card>
            )
          })}
          {accepted.map((contact) => (
            <Card
              key={contact.id}
              accentTop="success"
              className="ja-card-stack"
              data-tour={contact.id === UNITE_TOUR_CONTACT_ID ? 'demo-accepted' : undefined}
            >
              <div className="ja-badge-row">
                <Badge variant="success">En relation</Badge>
                {contact.id === UNITE_TOUR_CONTACT_ID && (
                  <Badge variant="warning">Demande d’exemple</Badge>
                )}
              </div>
              <p className="ja-card-line">
                {contact.unitName} · {contact.contact.name}
              </p>
              <p className="ja-card-sub">
                {contact.contact.email} · {contact.contact.phone}
              </p>
              <p className="ja-card-sub">
                La plateforme s’arrête là : le lieu, le planning et l’organisation se règlent entre
                les deux unités.
              </p>
            </Card>
          ))}
          {data.ad?.status === 'ACTIVE' && (
            <Card className="ja-card-stack">
              <p className="ja-card-line">Notre annonce est toujours en ligne.</p>
              <Button
                variant="secondary"
                size="sm"
                style={{ alignSelf: 'flex-start' }}
                data-withdraw-ad
                onClick={onWithdraw}
                disabled={busy}
              >
                Retirer notre annonce
              </Button>
            </Card>
          )}
          <HelpText>
            Ni refus ni expiration : une demande non acceptée reste sans suite, et le seul bouton de
            sortie est "retirer l’annonce". Une unité peut être jumelée plusieurs fois.
          </HelpText>
        </>
      ) : (
        <>
          {data.relations.length === 0 && (
            <EmptyState>Aucune mise en relation pour l’instant.</EmptyState>
          )}
          {data.relations.map((relation) => (
            <Card key={relation.id} accentTop="success" className="ja-card-stack">
              <div className="ja-badge-row">
                <Badge variant="success">En relation</Badge>
              </div>
              <p className="ja-card-line">
                <b>{relation.unitName}</b> · {relation.contactName}
              </p>
              <p className="ja-card-sub">
                {relation.email} · {relation.phone}
              </p>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}

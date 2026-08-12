import type { RequestRequesterView } from '@repo/contracts'
import { formatDateRangeShort } from '@repo/event-config'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { api } from '../lib/api'
import { useMe } from '../lib/hooks'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  HelpText,
  Loading,
  PageTitle,
  Tabs,
  Textarea,
} from '../ui'
import { personnesLabel } from './volontaire-lib'
import {
  buildSeekerTourRequest,
  SEEKER_TOUR_REQUEST_ID,
  useVolontaireTour,
} from './volontaire-tour'
import './volontaire.css'

type DemandeAcceptee = Extract<RequestRequesterView, { effectiveStatus: 'ACCEPTED' }>

const JOUR_MS = 86_400_000

/** « Envoyée il y a N jours » — badge relatif depuis createdAt. */
function libelleEnvoyee(createdAt: string): string {
  const jours = Math.floor((Date.now() - Date.parse(createdAt)) / JOUR_MS)
  if (jours <= 0) return 'Envoyée aujourd’hui'
  if (jours === 1) return 'Envoyée hier'
  return `Envoyée il y a ${jours} jours`
}

/** « Expire dans N jours » — « Expire demain » pour le dernier jour (depuis expiresAt). */
function libelleExpire(expiresAt: string): string {
  const jours = Math.ceil((Date.parse(expiresAt) - Date.now()) / JOUR_MS)
  if (jours <= 1) return 'Expire demain'
  return `Expire dans ${jours} jours`
}

/** « {titre} · {quartier} · {dates} · {N personnes} » (sans quartier sur une acceptée). */
function ligneDemande(demande: RequestRequesterView, avecZone: boolean): string {
  return [
    demande.listing.title,
    ...(avecZone ? [demande.listing.displayArea] : []),
    formatDateRangeShort(demande.dateFrom, demande.dateTo),
    personnesLabel(demande.peopleCount),
  ].join(' · ')
}

/** Annulation (demande ou réservation) : POST cancel puis rafraîchissement de la liste. */
function useAnnulation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.requests[':id'].cancel.$post({ param: { id } })
      if (res.status !== 200) throw new Error(`annulation : ${res.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-requests'] }),
  })
}

/** /mes-demandes — écran A.6 « Mes demandes, ». */
export function MesDemandes() {
  const [onglet, setOnglet] = useState(0)
  const tour = useVolontaireTour()
  const { me } = useMe()

  const demandes = useQuery({
    queryKey: ['my-requests'],
    queryFn: async () => {
      const res = await api.my.requests.$get()
      if (res.status !== 200) throw new Error(`GET /my/requests : ${res.status}`)
      return res.json()
    },
  })

  if (demandes.isPending) return <Loading />
  if (demandes.isError) {
    return (
      <div className="mes-demandes fade">
        <PageTitle>Mes demandes,</PageTitle>
        <p className="alert-text">Le chargement a échoué. Réessaie dans un instant.</p>
      </div>
    )
  }

  const { items, pendingCount, pendingLimit } = demandes.data
  // CANCELLED n’apparaît dans aucun onglet (règle B.4)
  // Tour guidé : la demande d'exemple est injectée en tête d'affichage — le
  // bandeau quota continue de raisonner sur le pendingCount réel de l'API.
  const enAttente = [
    ...(tour.active ? [buildSeekerTourRequest(me?.groupSize ?? null)] : []),
    ...items.filter((demande) => demande.effectiveStatus === 'PENDING'),
  ]
  const acceptees = items.filter(
    (demande): demande is DemandeAcceptee => demande.effectiveStatus === 'ACCEPTED',
  )
  const refusees = items.filter((demande) => demande.effectiveStatus === 'DECLINED')
  const expirees = items.filter((demande) => demande.effectiveStatus === 'EXPIRED')

  return (
    <div className="mes-demandes fade">
      <PageTitle>Mes demandes,</PageTitle>
      {pendingCount >= pendingLimit && (
        <Card accentTop="warning">
          <p className="text-body">
            <b>
              {pendingCount} sollicitations en attente sur {pendingLimit}.
            </b>{' '}
            Pour en envoyer une autre, annule ou attends une réponse.
          </p>
        </Card>
      )}
      <Tabs
        tabs={[
          { label: 'En attente', count: enAttente.length },
          { label: 'Acceptées' },
          { label: 'Refusées' },
          { label: 'Expirées' },
        ]}
        active={onglet}
        onChange={setOnglet}
      />
      {onglet === 0 && <OngletAttente demandes={enAttente} />}
      {onglet === 1 && <OngletAcceptees demandes={acceptees} />}
      {onglet === 2 && <OngletRefusees demandes={refusees} />}
      {onglet === 3 && <OngletExpirees demandes={expirees} limite={pendingLimit} />}
    </div>
  )
}

function OngletAttente({ demandes }: { demandes: RequestRequesterView[] }) {
  if (demandes.length === 0) return <EmptyState>Aucune demande en attente.</EmptyState>
  return (
    <div className="mes-demandes__liste">
      {demandes.map((demande) =>
        demande.awaitingSide === 'REQUESTER' ? (
          <CarteQuestion key={demande.id} demande={demande} />
        ) : (
          <CarteAttente key={demande.id} demande={demande} />
        ),
      )}
      <HelpText>
        Dès qu’un hébergeur accepte, tes autres demandes en attente sont annulées automatiquement et
        les hébergeurs concernés sont prévenus.
      </HelpText>
    </div>
  )
}

/** En attente côté hébergeur : badges relatifs + annulation. */
function CarteAttente({ demande }: { demande: RequestRequesterView }) {
  const annulation = useAnnulation()
  // Demande d'exemple du tour guidé : cibles data-tour pour les popovers, badge
  // explicite, et jamais d'appel API (le tour bloque de toute façon les clics).
  const demo = demande.id === SEEKER_TOUR_REQUEST_ID
  return (
    <Card className="mes-demandes__carte" data-tour={demo ? 'demo-card' : undefined}>
      <div className="mes-demandes__badges">
        {demo && <Badge variant="warning">Demande d’exemple</Badge>}
        <Badge>{libelleEnvoyee(demande.createdAt)}</Badge>
        <Badge>{libelleExpire(demande.expiresAt)}</Badge>
      </div>
      <p className="text-body">{ligneDemande(demande, true)}</p>
      {annulation.isError && (
        <p className="alert-text">L’annulation a échoué. Réessaie dans un instant.</p>
      )}
      <Button
        variant="secondary"
        size="sm"
        disabled={annulation.isPending}
        data-tour={demo ? 'demo-cancel' : undefined}
        onClick={() => {
          if (demo) return
          if (window.confirm('Annuler cette demande ?')) annulation.mutate(demande.id)
        }}
      >
        Annuler ma demande
      </Button>
    </Card>
  )
}

/** Question posée par l’hébergeur : la main est au demandeur, réponse inline. */
function CarteQuestion({ demande }: { demande: RequestRequesterView }) {
  const annulation = useAnnulation()
  const queryClient = useQueryClient()
  const [reponse, setReponse] = useState('')

  const envoi = useMutation({
    mutationFn: async () => {
      const res = await api.requests[':id'].messages.$post({
        param: { id: demande.id },
        json: { body: reponse.trim() },
      })
      if (res.status !== 200) throw new Error(`réponse : ${res.status}`)
    },
    onSuccess: () => {
      setReponse('')
      queryClient.invalidateQueries({ queryKey: ['my-requests'] })
    },
  })

  // Dernier message de l’hébergeur = la question à laquelle répondre
  const question = [...demande.messages].reverse().find((message) => message.from === 'HOST')

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!envoi.isPending && reponse.trim() !== '') envoi.mutate()
  }

  return (
    <Card accentTop="warning" className="mes-demandes__carte">
      <div className="mes-demandes__badges">
        <Badge variant="warning">Question posée</Badge>
        <Badge>Délai remis à 7 jours</Badge>
      </div>
      <p className="text-body">
        {demande.listing.title} · {demande.listing.displayArea}
      </p>
      {question && <p className="text-body">"{question.body}" — à toi de répondre.</p>}
      <form className="mes-demandes__reponse" onSubmit={onSubmit}>
        <Textarea
          uiSize="sm"
          value={reponse}
          onChange={(event) => setReponse(event.target.value)}
          aria-label="Ta réponse"
          required
        />
        {(envoi.isError || annulation.isError) && (
          <p className="alert-text">L’action a échoué. Réessaie dans un instant.</p>
        )}
        <div className="mes-demandes__actions">
          <Button type="submit" size="sm" disabled={envoi.isPending}>
            Répondre
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={annulation.isPending}
            onClick={() => {
              if (window.confirm('Annuler cette demande ?')) annulation.mutate(demande.id)
            }}
          >
            Annuler ma demande
          </Button>
        </div>
      </form>
    </Card>
  )
}

function OngletAcceptees({ demandes }: { demandes: DemandeAcceptee[] }) {
  if (demandes.length === 0) {
    return <EmptyState>Aucune demande acceptée pour l’instant.</EmptyState>
  }
  return (
    <div className="mes-demandes__liste">
      {demandes.map((demande) => (
        <CarteAcceptee key={demande.id} demande={demande} />
      ))}
      <HelpText>
        L’adresse complète et les coordonnées n’apparaissent qu’ici, après acceptation. L’annulation
        reste possible des deux côtés ; chacun est prévenu par e-mail.
      </HelpText>
    </div>
  )
}

/** Acceptée : la seule vue qui porte les coordonnées complètes de l’hébergeur. */
function CarteAcceptee({ demande }: { demande: DemandeAcceptee }) {
  const annulation = useAnnulation()
  const contact = demande.hostContact
  return (
    <Card accentTop="success" className="mes-demandes__carte">
      <div className="mes-demandes__badges">
        <Badge variant="success">Acceptée</Badge>
      </div>
      <p className="text-body">{ligneDemande(demande, false)}</p>
      <div className="mes-demandes__coordonnees">
        <p className="text-body">
          <b>
            {contact.firstName} {contact.lastName}
          </b>
        </p>
        <p className="text-body">
          {contact.phone} · {contact.email}
        </p>
        <p className="text-body">{contact.addressFull}</p>
      </div>
      {annulation.isError && (
        <p className="alert-text">L’annulation a échoué. Réessaie dans un instant.</p>
      )}
      <Button
        variant="secondary"
        disabled={annulation.isPending}
        onClick={() => {
          if (window.confirm('Annuler cette réservation ?')) annulation.mutate(demande.id)
        }}
      >
        Annuler ma réservation
      </Button>
    </Card>
  )
}

function OngletRefusees({ demandes }: { demandes: RequestRequesterView[] }) {
  if (demandes.length === 0) return <EmptyState>Aucune demande refusée.</EmptyState>
  return (
    <div className="mes-demandes__liste">
      {demandes.map((demande) => (
        <Card key={demande.id} className="mes-demandes__carte">
          <div className="mes-demandes__badges">
            <Badge variant="danger">Refusée</Badge>
          </div>
          <p className="text-body">{ligneDemande(demande, true)}</p>
        </Card>
      ))}
    </div>
  )
}

function OngletExpirees({
  demandes,
  limite,
}: {
  demandes: RequestRequesterView[]
  limite: number
}) {
  if (demandes.length === 0) {
    return (
      <EmptyState>
        Aucune demande expirée. Sans réponse au bout de 7 jours, une demande expire et libère une de
        tes {limite} sollicitations.
      </EmptyState>
    )
  }
  return (
    <div className="mes-demandes__liste">
      {demandes.map((demande) => (
        <Card key={demande.id} className="mes-demandes__carte">
          <div className="mes-demandes__badges">
            <Badge>Expirée</Badge>
          </div>
          <p className="text-body">{ligneDemande(demande, true)}</p>
        </Card>
      ))}
    </div>
  )
}

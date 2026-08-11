import type { RequestHostView } from '@repo/contracts'
import { formatDateRangeLong } from '@repo/event-config'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ACCESS_CRITERIA_LABELS } from '../lib/access-criteria'
import { api } from '../lib/api'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  FieldGroup,
  HelpText,
  Loading,
  PageTitle,
  Tabs,
  Textarea,
} from '../ui'
import {
  expiresLabel,
  MY_LISTINGS_KEY,
  peopleLabel,
  RECEIVED_REQUESTS_KEY,
  relativeDaysAgo,
  useListingStatus,
  useMyListings,
  useReceivedRequests,
} from './hebergeur-lib'
import './hebergeur.css'

/**
 * /hebergeur/demandes — écran A.8 « Demandes reçues, ». Onglets par effectiveStatus
 * (CANCELLED exclues), cartes actionnables quand c'est à l'hébergeur de répondre
 * (awaitingSide HOST), bloc « Disponibilité de mes logements » sous les onglets.
 */
export function HebergeurDemandes() {
  const [tab, setTab] = useState(0)
  const requestsQuery = useReceivedRequests()
  const listingsQuery = useMyListings()
  const setStatus = useListingStatus()

  if (requestsQuery.isPending || listingsQuery.isPending) return <Loading />

  const items = requestsQuery.data ?? []
  const listings = listingsQuery.data ?? []
  const capacityById = new Map(listings.map((listing) => [listing.id, listing.capacity]))

  const pending = items.filter((r) => r.effectiveStatus === 'PENDING')
  const accepted = items.filter((r) => r.effectiveStatus === 'ACCEPTED')
  const declined = items.filter((r) => r.effectiveStatus === 'DECLINED')
  const expired = items.filter((r) => r.effectiveStatus === 'EXPIRED')

  return (
    <div className="demandes fade">
      <PageTitle>Demandes reçues,</PageTitle>
      {(requestsQuery.isError || listingsQuery.isError) && (
        <p className="alert-text">Impossible de charger les demandes. Recharge la page.</p>
      )}
      <Tabs
        tabs={[
          { label: 'En attente', count: pending.length },
          { label: 'Acceptées' },
          { label: 'Refusées' },
          { label: 'Expirées' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 0 && (
        <div className="demandes__list">
          {pending.length === 0 && <EmptyState>Aucune demande en attente.</EmptyState>}
          {pending.map((request) =>
            request.awaitingSide === 'HOST' ? (
              <PendingCard
                key={request.id}
                request={request}
                capacity={capacityById.get(request.listingId)}
              />
            ) : (
              <WaitingAnswerCard key={request.id} request={request} />
            ),
          )}
        </div>
      )}
      {tab === 1 && (
        <div className="demandes__list">
          {accepted.length === 0 && (
            <EmptyState>Aucune demande acceptée pour l’instant.</EmptyState>
          )}
          {accepted.map((request) => (
            <AcceptedCard key={request.id} request={request} />
          ))}
        </div>
      )}
      {tab === 2 && (
        <div className="demandes__list">
          {declined.length === 0 && <EmptyState>Aucune demande refusée.</EmptyState>}
          {declined.map((request) => (
            <ClosedCard key={request.id} request={request} />
          ))}
        </div>
      )}
      {tab === 3 && (
        <div className="demandes__list">
          {expired.length === 0 && <EmptyState>Aucune demande expirée.</EmptyState>}
          {expired.map((request) => (
            <ClosedCard key={request.id} request={request} />
          ))}
        </div>
      )}
      {listings.length > 0 && (
        <>
          <hr className="divider" />
          <FieldGroup label="Disponibilité de mes logements">
            {listings.map((listing) => (
              <div key={listing.id} className="dispo-row">
                <span className="dispo-row__title">{listing.title}</span>
                <span className="chips">
                  <Chip
                    active={listing.status === 'OPEN'}
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: listing.id, status: 'OPEN' })}
                  >
                    Libre
                  </Chip>
                  <Chip
                    active={listing.status === 'FULL'}
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: listing.id, status: 'FULL' })}
                  >
                    Complet
                  </Chip>
                </span>
              </div>
            ))}
          </FieldGroup>
          <HelpText>
            Passer en "complet" sort le logement des recherches sans rien annuler. Sans action
            pendant 7 jours, la demande expire et le logement est masqué automatiquement.
          </HelpText>
        </>
      )}
    </div>
  )
}

/** Ligne d'identité commune : avatar 44px + « Prénom Nom · N personnes — dates ». */
function RequestHead({ request }: { request: RequestHostView }) {
  const { firstName, lastName } = request.requester
  return (
    <div className="demande-card__head">
      <Avatar name={`${firstName} ${lastName}`} size={44} />
      <p className="demande-card__title">
        <b>
          {firstName} {lastName}
        </b>{' '}
        · {peopleLabel(request.peopleCount)} —{' '}
        {formatDateRangeLong(request.dateFrom, request.dateTo)}
      </p>
    </div>
  )
}

/** Invalidation commune après une action : demandes reçues + logements (pendingRequests). */
function useInvalidateHebergeur() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: RECEIVED_REQUESTS_KEY })
    queryClient.invalidateQueries({ queryKey: MY_LISTINGS_KEY })
  }
}

/** Carte en attente côté hébergeur : Accepter / Poser une question / Refuser. */
function PendingCard({
  request,
  capacity,
}: {
  request: RequestHostView
  capacity: number | undefined
}) {
  const invalidate = useInvalidateHebergeur()
  const [questionOpen, setQuestionOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const { firstName, lastName, phone, needs } = request.requester
  const firstMessage = request.messages.find((message) => message.from === 'REQUESTER')

  const accept = useMutation({
    mutationFn: async () => {
      const res = await api.requests[':id'].accept.$post({ param: { id: request.id } })
      if (res.status !== 200) throw new Error(`accepter la demande : ${res.status}`)
    },
    onSuccess: invalidate,
  })

  const decline = useMutation({
    mutationFn: async () => {
      const res = await api.requests[':id'].decline.$post({ param: { id: request.id } })
      if (res.status !== 200) throw new Error(`refuser la demande : ${res.status}`)
    },
    onSuccess: invalidate,
  })

  const sendQuestion = useMutation({
    mutationFn: async (body: string) => {
      const res = await api.requests[':id'].messages.$post({
        param: { id: request.id },
        json: { body },
      })
      if (res.status !== 200) throw new Error(`poser la question : ${res.status}`)
    },
    onSuccess: () => {
      setQuestionOpen(false)
      setQuestion('')
      invalidate()
    },
  })

  const busy = accept.isPending || decline.isPending
  const onDecline = () => {
    if (window.confirm(`Refuser la demande de ${firstName} ${lastName} ?`)) decline.mutate()
  }

  return (
    <Card className="demande-card">
      <RequestHead request={request} />
      {firstMessage && <p className="demande-card__quote">« {firstMessage.body} »</p>}
      <p className="demande-card__contact">
        <b>{phone}</b> — c’est à toi de contacter {firstName} : {firstName} ne peut pas t’écrire en
        dehors de sa demande.
      </p>
      <div className="demande-card__badges">
        {needs.map((need) => (
          <Badge key={need}>Besoin : {ACCESS_CRITERIA_LABELS[need].label}</Badge>
        ))}
        {request.overCapacity && capacity !== undefined && (
          <Badge variant="danger">
            {request.peopleCount} pers. pour {capacity} places
          </Badge>
        )}
        <Badge>{expiresLabel(request.expiresAt)}</Badge>
      </div>
      <div className="demande-card__actions">
        <Button size="sm" disabled={busy} onClick={() => accept.mutate()}>
          Accepter
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setQuestionOpen((open) => !open)}>
          Poser une question
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={onDecline}>
          Refuser
        </Button>
      </div>
      {questionOpen && (
        <div className="demande-card__question">
          <Field label="Ta question">
            <Textarea
              uiSize="sm"
              value={question}
              maxLength={2000}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </Field>
          <Button
            size="sm"
            style={{ alignSelf: 'flex-start' }}
            disabled={question.trim() === '' || sendQuestion.isPending}
            onClick={() => sendQuestion.mutate(question.trim())}
          >
            Envoyer
          </Button>
        </div>
      )}
      {(accept.isError || decline.isError || sendQuestion.isError) && (
        <p className="alert-text">L’action a échoué. Recharge la page, puis réessaie.</p>
      )}
    </Card>
  )
}

/** En attente, mais c'est au demandeur de répondre (question posée) — pas d'action. */
function WaitingAnswerCard({ request }: { request: RequestHostView }) {
  const { firstName, lastName } = request.requester
  return (
    <Card className="demande-card">
      <div className="demande-card__head">
        <Avatar name={`${firstName} ${lastName}`} size={44} />
        <p className="demande-card__title">
          <b>
            {firstName} {lastName}
          </b>{' '}
          · {peopleLabel(request.peopleCount)} — question posée{' '}
          {relativeDaysAgo(request.lastActivityAt)}, délai remis à 7 jours.
        </p>
      </div>
    </Card>
  )
}

/** Demande acceptée : coordonnées échangées, autres demandes du volontaire annulées. */
function AcceptedCard({ request }: { request: RequestHostView }) {
  return (
    <Card accentTop="success" className="demande-card">
      <div className="demande-card__badges">
        <Badge variant="success">Acceptée</Badge>
      </div>
      <RequestHead request={request} />
      <p className="text-body">
        Coordonnées échangées : {request.requester.firstName} reçoit ton adresse complète et ton
        téléphone, ses autres demandes sont annulées automatiquement.
      </p>
    </Card>
  )
}

/** Demande refusée ou expirée : simple rappel d'identité, sans action. */
function ClosedCard({ request }: { request: RequestHostView }) {
  return (
    <Card className="demande-card">
      <RequestHead request={request} />
    </Card>
  )
}

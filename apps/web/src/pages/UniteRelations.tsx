import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../lib/api'
import { Badge, Button, Card, EmptyState, HelpText, Loading, PageTitle, Tabs } from '../ui'
import { JUMELAGE_ADS_KEY, MY_JUMELAGE_KEY, type MyJumelage, useMyJumelage } from './jumelage-data'
import './jumelage-admin.css'

type Received = MyJumelage['received'][number]
type ReceivedPending = Extract<Received, { status: 'PENDING' }>
type ReceivedAccepted = Extract<Received, { status: 'ACCEPTED' }>

/**
 * /unite/relations — écran A.16 « Demandes de mise en relation, ». Accepter ou
 * ignorer, jamais refuser : une demande non acceptée reste sans suite, et la
 * seule porte de sortie est le retrait de l'annonce.
 */
export function UniteRelations() {
  const [tab, setTab] = useState(0)
  const queryClient = useQueryClient()
  const { data, isPending, isError } = useMyJumelage()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: MY_JUMELAGE_KEY })
  }

  const accept = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.jumelage.contacts[':id'].accept.$post({ param: { id } })
      // 409 = déjà acceptée (double clic) : le refetch suffit, pas d'erreur à montrer.
      if (res.status !== 200 && res.status !== 409) throw new Error(`accept : ${res.status}`)
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

  if (isPending) return <Loading />
  if (isError || !data) {
    return (
      <p className="alert-text">Impossible de charger les demandes. Réessayez dans un instant.</p>
    )
  }

  const pending = data.received.filter((c): c is ReceivedPending => c.status === 'PENDING')
  const accepted = data.received.filter((c): c is ReceivedAccepted => c.status === 'ACCEPTED')
  const busy = accept.isPending || dismiss.isPending || withdraw.isPending
  const actionFailed = accept.isError || dismiss.isError || withdraw.isError

  const onWithdraw = () => {
    const confirmed = window.confirm(
      'Retirer notre annonce ? Les mises en relation déjà acceptées restent acquises.',
    )
    if (confirmed) withdraw.mutate()
  }

  return (
    <div className="ja-col ja-col--680 fade">
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
            return (
              <Card key={contact.id} className="ja-card-stack">
                <p className="ja-card-line">
                  <b>{contact.unitName}</b>
                  {contact.unitBranch ? ` · ${contact.unitBranch}` : ''}
                  {meta ? ` — ${meta}` : ''}
                </p>
                {contact.message && <p className="ja-quote">« {contact.message} »</p>}
                <div className="ja-actions">
                  <Button size="sm" onClick={() => accept.mutate(contact.id)} disabled={busy}>
                    Accepter et échanger nos contacts
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => dismiss.mutate(contact.id)}
                    disabled={busy}
                  >
                    Ignorer
                  </Button>
                </div>
              </Card>
            )
          })}
          {accepted.map((contact) => (
            <Card key={contact.id} accentTop="success" className="ja-card-stack">
              <div className="ja-badge-row">
                <Badge variant="success">En relation</Badge>
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

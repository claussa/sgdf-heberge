import type { JumelageAd } from '@repo/contracts'
import { formatDateRangeLong, siteLabel } from '@repo/event-config'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../lib/api'
import { Button, Field, HelpText, Loading, PageTitle, SuccessPanel, Textarea } from '../ui'
import { MY_JUMELAGE_KEY } from './jumelage-data'
import './jumelage-admin.css'

/** /jumelage/:adId — écran A.15 : fiche unité + demande de mise en relation. */
export function JumelageFiche() {
  const { adId = '' } = useParams()
  const query = useQuery({
    queryKey: ['jumelage-ad', adId],
    // Type fixé au contrat (JumelageAdSchema) — cf. jumelage-data sur le motif
    queryFn: async (): Promise<JumelageAd> => {
      const res = await api.jumelage.ads[':id'].$get({ param: { id: adId } })
      if (res.status === 200) return res.json()
      throw new Error(`GET /jumelage/ads/{id} : ${res.status}`)
    },
    enabled: adId !== '',
  })

  if (query.isPending) return <Loading />
  if (query.isError || !query.data) {
    return (
      <div className="ja-col ja-col--560 fade">
        <Link to="/jumelage" className="ja-link">
          ← Retour au jumelage
        </Link>
        <p className="alert-text">Impossible de charger cette annonce.</p>
      </div>
    )
  }
  return <FicheUnite ad={query.data} />
}

function FicheUnite({ ad }: { ad: JumelageAd }) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')

  const send = useMutation({
    mutationFn: async () => {
      const trimmed = message.trim()
      const res = await api.jumelage.ads[':id'].contacts.$post({
        param: { id: ad.id },
        json: { message: trimmed === '' ? null : trimmed },
      })
      if (res.status === 201) return
      throw new Error(res.status === 409 ? 'ALREADY_SENT' : `POST contacts : ${res.status}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_JUMELAGE_KEY })
    },
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!send.isPending) send.mutate()
  }

  const alreadySent = send.isError && send.error.message === 'ALREADY_SENT'

  return (
    <div className="ja-col ja-col--560 fade">
      <Link to="/jumelage" className="ja-link">
        ← Retour au jumelage
      </Link>
      <PageTitle>{ad.unitName},</PageTitle>
      <p className="ja-subtitle">
        {ad.unitBranch ? `${ad.unitBranch} · ` : ''}
        {siteLabel(ad.site)} · {ad.kind === 'HOSTING' ? 'peut jumeler jusqu’à' : 'nous serons'}{' '}
        {ad.peopleLabel} {formatDateRangeLong(ad.dateFrom, ad.dateTo)}
      </p>
      {ad.description && <p className="ja-quote">« {ad.description} »</p>}
      {send.isSuccess ? (
        <SuccessPanel>
          <p className="text-body">
            <b>Demande envoyée !</b> Si {ad.unitName} accepte, vous recevez chacun l’e-mail et le
            téléphone de l’autre, et vous vous organisez entre unités.
          </p>
        </SuccessPanel>
      ) : (
        <form className="ja-col" onSubmit={onSubmit}>
          <Field label="Demander une mise en relation">
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Qui nous sommes, ce que nous venons faire…"
              maxLength={1000}
            />
          </Field>
          {send.isError && (
            <p className="alert-text">
              {alreadySent
                ? 'Demande déjà envoyée.'
                : 'Impossible d’envoyer la demande. Réessayez dans un instant.'}
            </p>
          )}
          <Button
            type="submit"
            style={{ minWidth: 220, alignSelf: 'flex-start' }}
            disabled={send.isPending}
          >
            Demander à être mis en relation
          </Button>
        </form>
      )}
      <HelpText>
        Une demande non acceptée reste simplement sans suite : ni refus, ni expiration.
      </HelpText>
    </div>
  )
}

import { eventConfig } from '@repo/event-config'
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { api } from '../lib/api'
import { assetUrl } from '../lib/assets'
import { useMe } from '../lib/hooks'
import { Button, Field, HelpText, Input, Loading, PageTitle, SuccessPanel } from '../ui'

/**
 * Écran de connexion (A.1) : panneau hero bleu (textes de eventConfig) + formulaire
 * magic link. Gère `?error=lien-invalide` (callback API) et redirige si déjà connecté.
 */
export function Connexion() {
  const { me, isPending } = useMe()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')

  const send = useMutation({
    mutationFn: async (value: string) => {
      const res = await api.auth['magic-link'].$post({ json: { email: value } })
      if (res.status !== 202) throw new Error(`POST /auth/magic-link : ${res.status}`)
    },
  })

  if (isPending) return <Loading />
  if (me) return <Navigate to="/" replace />

  const linkInvalid = searchParams.get('error') === 'lien-invalide' && !send.isSuccess

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!send.isPending && !send.isSuccess) send.mutate(email)
  }

  return (
    <div className="connexion fade">
      <div className="connexion__hero">
        <img
          src={assetUrl(eventConfig.assets.logoVertical)}
          alt={eventConfig.organizer}
          className="connexion__hero-logo"
        />
        <div className="connexion__hero-spacer" />
        <p className="connexion__hero-title">{eventConfig.hero.title}</p>
        <p className="connexion__hero-text">{eventConfig.hero.text}</p>
        <img
          src={assetUrl('papier-dechire-vertical.png')}
          alt=""
          className="connexion__dechirure"
        />
      </div>
      <div className="connexion__panel">
        <form className="connexion__form" onSubmit={onSubmit}>
          <img
            src={assetUrl(eventConfig.assets.logoEvent)}
            alt={eventConfig.name}
            className="connexion__event-logo"
          />
          <PageTitle>Connecte-toi en un clic,</PageTitle>
          <p className="text-body">
            On t’envoie un lien de connexion. Pas de mot de passe à retenir, pas de compte à créer
            avant.
          </p>
          {linkInvalid && (
            <p className="banner-error">Ce lien n’est plus valable. Demande-en un nouveau.</p>
          )}
          <Field label="E-mail">
            <Input
              type="email"
              uiSize="lg"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          {send.isSuccess ? (
            <SuccessPanel>
              <p className="text-body">
                <b>Le lien est parti !</b> Vérifie ta boîte mail : il est valable 10 minutes.
              </p>
            </SuccessPanel>
          ) : (
            <>
              {send.isError && (
                <p className="alert-text">L’envoi a échoué. Attends un instant, puis réessaie.</p>
              )}
              <Button type="submit" block disabled={send.isPending}>
                Recevoir mon lien
              </Button>
            </>
          )}
          <HelpText>Première visite ? Le lien crée ton compte, tout simplement.</HelpText>
        </form>
      </div>
    </div>
  )
}

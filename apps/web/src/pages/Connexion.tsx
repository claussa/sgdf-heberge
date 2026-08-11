import { eventConfig } from '@repo/event-config'
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { api } from '../lib/api'
import { assetUrl } from '../lib/assets'
import { useMe } from '../lib/hooks'
import {
  Button,
  Field,
  HelpText,
  Input,
  Loading,
  PageTitle,
  SigneMask,
  type SigneName,
  SuccessPanel,
} from '../ui'

/**
 * Chemin des autres routes (« Tu cherches autre chose ? ») — liens externes de
 * eventConfig.otherRoutes. Deux traitements (maquette Connexion - propositions) :
 * `hero` sur le panneau bleu (desktop, 1c) et `panel` sur fond blanc (mobile, 4a).
 */
function AutresRoutes({ variant }: { variant: 'hero' | 'panel' }) {
  return (
    <div className={`routes routes--${variant}`}>
      <p className="routes__title">{eventConfig.otherRoutes.title}</p>
      <div className="routes__chemin">
        {eventConfig.otherRoutes.links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener"
            className="routes__link"
          >
            <span className="routes__signe-box">
              <SigneMask name={link.signe as SigneName} className="routes__signe" />
            </span>
            <span className="routes__text">
              <span className="routes__label">{link.label}</span>
              <span className="routes__desc">{link.description}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

/**
 * Écran de connexion (A.1) : panneau hero bleu (textes de eventConfig) + formulaire
 * magic link. Desktop = proposition 1c (chemin des autres routes en bas du bleu) ;
 * mobile = proposition 4a (deux écrans aimantés : accroche, puis connexion et chemin).
 * Gère `?error=lien-invalide` (callback API) et redirige si déjà connecté.
 */
export function Connexion() {
  const { me, isPending } = useMe()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

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
        <AutresRoutes variant="hero" />
        <div className="connexion__hero-spacer connexion__hero-spacer--mobile" />
        <button
          type="button"
          className="connexion__continue"
          // Défilement instantané : le lissé (`smooth`) se fait interrompre par
          // l'aimantation `scroll-snap-type: y mandatory` et s'arrête à mi-course.
          onClick={() => panelRef.current?.scrollIntoView()}
        >
          <SigneMask name="fleche" className="connexion__continue-fleche" />
          Continue vers la connexion
        </button>
        <img
          src={assetUrl('papier-dechire-vertical.png')}
          alt=""
          className="connexion__dechirure"
        />
      </div>
      <div className="connexion__panel" ref={panelRef}>
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
        <div className="connexion__autres">
          <div className="connexion__autres-filet" />
          <AutresRoutes variant="panel" />
        </div>
      </div>
    </div>
  )
}

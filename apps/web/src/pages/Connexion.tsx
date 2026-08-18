import { MAGIC_LINK_RESEND_COOLDOWN_SECONDS } from '@repo/contracts'
import { eventConfig } from '@repo/event-config'
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
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
 * Chemin des autres routes (« Tu cherches autre chose ? ») — liens de
 * eventConfig.otherRoutes : externes (nouvel onglet) ou internes à la SPA
 * (chemin commençant par « / », ex. /transport). Deux traitements (maquette
 * Connexion - propositions) : `hero` sur le panneau bleu (desktop, 1c) et
 * `panel` sur fond blanc (mobile, 4a).
 */
function AutresRoutes({ variant }: { variant: 'hero' | 'panel' }) {
  return (
    <div className={`routes routes--${variant}`}>
      <p className="routes__title">{eventConfig.otherRoutes.title}</p>
      <div className="routes__chemin">
        {eventConfig.otherRoutes.links.map((link) => {
          const content = (
            <>
              <span className="routes__signe-box">
                <SigneMask name={link.signe as SigneName} className="routes__signe" />
              </span>
              <span className="routes__text">
                <span className="routes__label">{link.label}</span>
                <span className="routes__desc">{link.description}</span>
              </span>
            </>
          )
          return link.href.startsWith('/') ? (
            <Link key={link.href} to={link.href} className="routes__link">
              {content}
            </Link>
          ) : (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener"
              className="routes__link"
            >
              {content}
            </a>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Secondes restantes avant `target` (epoch ms), rafraîchies chaque seconde.
 * Affichage seulement : la règle est appliquée côté API (cooldown en base dans
 * requestMagicLink, même constante partagée via @repo/contracts).
 */
function useCountdown(target: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (target === null) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])
  return target === null ? 0 : Math.max(0, Math.ceil((target - now) / 1000))
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Écran de connexion (A.1) : panneau hero bleu (textes de eventConfig) + formulaire
 * magic link. Desktop = proposition 1c (chemin des autres routes en bas du bleu) ;
 * mobile = proposition 4a (deux écrans aimantés : accroche, puis connexion et chemin) ;
 * logos = proposition 6a (le logo événement vit dans la barre, aucun logo ici).
 * Gère `?error=lien-invalide` (callback API) et redirige si déjà connecté.
 */
export function Connexion() {
  const { me, isPending } = useMe()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  // Nombre d'envois pour cet email (1er envoi, puis renvoi) et date à partir de
  // laquelle un renvoi est possible — même délai que la garde serveur.
  const [sendCount, setSendCount] = useState(0)
  const [resendAt, setResendAt] = useState<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const send = useMutation({
    mutationFn: async (value: string) => {
      const res = await api.auth['magic-link'].$post({ json: { email: value } })
      if (res.status !== 202) throw new Error(`POST /auth/magic-link : ${res.status}`)
    },
    onSuccess: () => {
      setSendCount((count) => count + 1)
      setResendAt(Date.now() + MAGIC_LINK_RESEND_COOLDOWN_SECONDS * 1000)
    },
  })

  const resendIn = useCountdown(resendAt)

  if (isPending) return <Loading />
  if (me) return <Navigate to="/" replace />

  const linkInvalid = searchParams.get('error') === 'lien-invalide' && sendCount === 0

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!send.isPending && sendCount === 0) send.mutate(email)
  }

  const tryAnotherEmail = () => {
    send.reset()
    setSendCount(0)
    setResendAt(null)
    setEmail('')
  }

  return (
    <div className="connexion fade">
      <div className="connexion__hero">
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
              disabled={sendCount > 0}
            />
          </Field>
          {send.isError && (
            <p className="alert-text">L’envoi a échoué. Attends un instant, puis réessaie.</p>
          )}
          {sendCount > 0 ? (
            <>
              <SuccessPanel>
                <p className="text-body">
                  <b>{sendCount > 1 ? 'Un nouveau lien est parti !' : 'Le lien est parti !'}</b>{' '}
                  Vérifie ta boîte mail : il est valable 10 minutes.
                </p>
                <p className="text-body">
                  Rien reçu au bout de quelques minutes ? <b>Pense à regarder dans tes spams</b>{' '}
                  (courriers indésirables).
                </p>
              </SuccessPanel>
              {resendIn > 0 ? (
                <>
                  <Button variant="secondary" block disabled>
                    Renvoyer le lien ({formatCountdown(resendIn)})
                  </Button>
                  <HelpText>
                    Toujours rien ? Tu pourras demander un nouveau lien à la fin du décompte.
                  </HelpText>
                </>
              ) : (
                <Button
                  variant="secondary"
                  block
                  disabled={send.isPending}
                  onClick={() => send.mutate(email)}
                >
                  Renvoyer le lien
                </Button>
              )}
              {sendCount > 1 && (
                <button type="button" className="connexion__autre-mail" onClick={tryAnotherEmail}>
                  Essayer avec un autre e-mail
                </button>
              )}
            </>
          ) : (
            <Button type="submit" block disabled={send.isPending}>
              Recevoir mon lien
            </Button>
          )}
          <HelpText>
            Première visite ? Le lien crée ton compte, tout simplement.{' '}
            <Link to="/comment-ca-marche">Comment ça marche ?</Link>
          </HelpText>
        </form>
        <div className="connexion__autres">
          <div className="connexion__autres-filet" />
          <AutresRoutes variant="panel" />
        </div>
      </div>
    </div>
  )
}

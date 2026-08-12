import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ChoiceCard } from '../components/ChoiceCard'
import { useMe } from '../lib/hooks'
import { Button, HelpText, Loading, PageTitle } from '../ui'

type Choice = 'volontaire' | 'unite'

/**
 * Écran « Je m'inscris comme… » (A.2). Aucun appel API ici : le choix volontaire mène
 * aux écrans profil (où se fait l'onboarding réel), avec l'accountType mémorisé en
 * state de navigation. Un compte déjà typé est renvoyé vers l'accueil.
 */
export function Inscription() {
  const { me, isPending } = useMe()
  const navigate = useNavigate()
  const [choice, setChoice] = useState<Choice | null>(null)

  if (isPending) return <Loading />
  if (me?.accountType) return <Navigate to="/" replace />

  return (
    <div className="inscription fade">
      <PageTitle>Je m’inscris comme…</PageTitle>
      <div className="inscription__choices">
        <ChoiceCard
          name="account-type"
          selected={choice === 'volontaire'}
          onSelect={() => setChoice('volontaire')}
          title="Volontaire ou participant"
          text="Seul ou en petit groupe : je cherche où dormir, ou je propose un logement."
        />
        <ChoiceCard
          name="account-type"
          selected={choice === 'unite'}
          onSelect={() => setChoice('unite')}
          title="Unité scoute"
          text="Jumelage : nous cherchons une unité sur place, ou nous pouvons en accueillir une."
        />
      </div>
      {choice === 'volontaire' && (
        <div className="inscription__actions fade">
          <Button
            onClick={() =>
              navigate('/profil?premiere=cherche', { state: { accountType: 'INDIVIDUAL' } })
            }
          >
            Je cherche un logement
          </Button>
          <Button
            onClick={() =>
              navigate('/hebergeur?premiere=propose', { state: { accountType: 'INDIVIDUAL' } })
            }
          >
            Je propose un logement
          </Button>
        </div>
      )}
      {choice === 'unite' && (
        <Button
          className="fade"
          style={{ minWidth: 200, alignSelf: 'flex-start' }}
          onClick={() => navigate('/unite', { state: { accountType: 'SCOUT_UNIT' } })}
        >
          Continuer
        </Button>
      )}
      <HelpText>
        Tu pourras ajouter un autre rôle plus tard, depuis ton profil, sans refaire de compte.
      </HelpText>
    </div>
  )
}

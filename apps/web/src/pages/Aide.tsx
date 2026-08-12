import { eventConfig } from '@repo/event-config'
import { Link } from 'react-router'
import { PageTitle, SigneMask, type SigneName } from '../ui'

const { legal } = eventConfig

/** mailto: avec objet pré-rempli et copie éventuelle (helpCcEmail de la config). */
function mailtoHref(to: string, subject: string): string {
  const params = new URLSearchParams({ subject })
  if (legal.helpCcEmail) params.set('cc', legal.helpCcEmail)
  return `mailto:${to}?${params.toString().replace(/\+/g, '%20')}`
}

type ChoiceProps = {
  signe: SigneName
  title: string
  description: string
  to: string
  subject: string
}

function Choice({ signe, title, description, to, subject }: ChoiceProps) {
  return (
    <a className="aide-choice" href={mailtoHref(to, subject)}>
      <span className="aide-choice__signe-box" aria-hidden="true">
        <SigneMask name={signe} className="aide-choice__signe" />
      </span>
      <span className="aide-choice__body">
        <span className="aide-choice__title">{title}</span>
        <span className="aide-choice__desc">{description}</span>
        <span className="aide-choice__email">{to}</span>
      </span>
    </a>
  )
}

/**
 * Page publique « Besoin d'aide ? » (lien du pied de page, sans connexion) :
 * oriente vers le bon contact — DPO pour les données personnelles, équipe
 * événement pour le reste. Chaque choix ouvre le client mail (mailto).
 */
export function Aide() {
  return (
    <div className="aide fade">
      <PageTitle>Besoin d'aide ?</PageTitle>
      <p className="aide__intro">
        Choisis le sujet de ta demande : elle partira directement au bon interlocuteur, depuis ta
        messagerie.
      </p>

      <div className="aide__choices">
        <Choice
          signe="promesse"
          title="Mes données personnelles"
          description="Accès, rectification, suppression de ton compte ou toute question sur l'usage de tes données : écris au délégué à la protection des données."
          to={legal.dpoEmail}
          subject={`[${eventConfig.appName}] Mes données personnelles`}
        />
        <Choice
          signe="soleil"
          title="Une question sur la plateforme ou l'événement"
          description="Connexion, logements, demandes, jumelage, ou toute question sur l'événement : l'équipe organisatrice te répond."
          to={legal.contactEmail}
          subject={`[${eventConfig.appName}] Question sur la plateforme`}
        />
      </div>

      <p className="aide__note">
        Tu peux aussi consulter la page <Link to="/comment-ca-marche">« Comment ça marche »</Link> :
        elle répond déjà aux questions les plus fréquentes.
      </p>
    </div>
  )
}

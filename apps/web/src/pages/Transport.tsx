import { eventConfig, siteLabel } from '@repo/event-config'
import { Link } from 'react-router'
import { PageTitle, SigneMask } from '../ui'

const { transport } = eventConfig

/**
 * Page publique « Transport » (bouton « Le transport, c'est par ici » de l'écran
 * de connexion, sans connexion) : un formulaire de covoiturage par site, ouvert
 * dans un nouvel onglet (Vroum, LaToileScoute). Même gabarit que « Besoin d'aide ? ».
 */
export function Transport() {
  return (
    <div className="aide fade">
      <PageTitle>{transport.title}</PageTitle>
      <p className="aide__intro">{transport.intro}</p>

      <div className="aide__choices">
        {transport.covoiturage.map((form) => (
          <a
            key={form.site}
            className="aide-choice"
            href={form.href}
            target="_blank"
            rel="noopener"
          >
            <span className="aide-choice__signe-box" aria-hidden="true">
              <SigneMask name="fleche" className="aide-choice__signe" />
            </span>
            <span className="aide-choice__body">
              <span className="aide-choice__title">Covoiturage — {siteLabel(form.site)}</span>
              <span className="aide-choice__desc">
                Proposer des places ou trouver une voiture pour rejoindre {siteLabel(form.site)}.
              </span>
              <span className="aide-choice__email">{new URL(form.href).host}</span>
            </span>
          </a>
        ))}
      </div>

      <p className="aide__note">
        Une question sur le transport ou la plateforme ? Passe par la page{' '}
        <Link to="/aide">« Besoin d'aide ? »</Link>.
      </p>
    </div>
  )
}

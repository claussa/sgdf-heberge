import { eventConfig } from '@repo/event-config'
import { Link } from 'react-router'
import { SigneMask } from '../ui'

/**
 * Carte compacte vers la page /transport — section « Et si besoin » des écrans
 * profil (seul point d'entrée une fois connecté, le bloc « Tu cherches autre
 * chose ? » n'existant que sur l'écran de connexion). Même style que les cartes
 * de /transport et « Besoin d'aide ? ».
 */
export function TransportLink() {
  return (
    <Link className="aide-choice" to="/transport">
      <span className="aide-choice__signe-box" aria-hidden="true">
        <SigneMask name="fleche" className="aide-choice__signe" />
      </span>
      <span className="aide-choice__body">
        <span className="aide-choice__title">{eventConfig.transport.title}</span>
        <span className="aide-choice__desc">
          Propose des places ou trouve une voiture pour rejoindre ton site.
        </span>
      </span>
    </Link>
  )
}

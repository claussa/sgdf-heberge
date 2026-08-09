import { HelpText, PageTitle } from '../ui'

/**
 * Écran temporaire des pages en construction. Chaque page réelle remplacera son
 * propre fichier (src/pages/…) sans toucher au router.
 */
export function PagePlaceholder() {
  return (
    <div className="placeholder fade">
      <PageTitle>Bientôt disponible,</PageTitle>
      <HelpText>Cet écran est en cours de construction.</HelpText>
    </div>
  )
}

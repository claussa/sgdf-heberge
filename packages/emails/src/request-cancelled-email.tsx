/** @jsxRuntime automatic @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import { EmailButton, EmailLayout, emailStyles, greeting } from './components/email-layout'

export interface RequestCancelledEmailProps {
  /** Nullable : l'API envoie aussi cet email lors de suppressions de comptes coquilles. */
  toFirstName: string | null
  listingTitle: string
  /**
   * « le demandeur » / « l'hébergeur » / « automatiquement : le demandeur a été accepté
   * ailleurs ». Le tiret cadratin absorbe les trois formes (« par {label} » ne passe pas
   * avec la forme automatique).
   */
  cancelledByLabel: string
  actionUrl: string
}

/** Demande annulée → l'autre côté (annulation manuelle ou automatique). */
export function RequestCancelledEmail({
  toFirstName,
  listingTitle,
  cancelledByLabel,
  actionUrl,
}: RequestCancelledEmailProps) {
  return (
    <EmailLayout preview={`La demande concernant « ${listingTitle} » a été annulée`}>
      <Heading as="h2" style={emailStyles.heading}>
        {greeting(toFirstName)}
      </Heading>
      <Text style={emailStyles.paragraph}>
        La demande concernant « {listingTitle} » a été annulée — {cancelledByLabel}.
      </Text>
      <Text style={emailStyles.paragraph}>Aucune action n'est nécessaire de ta part.</Text>
      <EmailButton href={actionUrl}>Ouvrir mon espace</EmailButton>
    </EmailLayout>
  )
}

/** @jsxRuntime automatic @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import { EmailButton, EmailLayout, emailStyles, greeting } from './components/email-layout'

export interface ListingHiddenEmailProps {
  hostFirstName: string
  listingTitle: string
  actionUrl: string
}

/** Logement masqué pour inactivité (7 jours sans réponse à une demande) → hébergeur. */
export function ListingHiddenEmail({
  hostFirstName,
  listingTitle,
  actionUrl,
}: ListingHiddenEmailProps) {
  return (
    <EmailLayout preview={`« ${listingTitle} » n'apparaît plus dans les recherches`}>
      <Heading as="h2" style={emailStyles.heading}>
        {greeting(hostFirstName)}
      </Heading>
      <Text style={emailStyles.paragraph}>
        Sans action pendant 7 jours, ton logement « {listingTitle} » a été masqué des recherches.
      </Text>
      <Text style={emailStyles.paragraph}>
        Pour le réactiver, ouvre ton espace et repasse-le en "libre".
      </Text>
      <EmailButton href={actionUrl}>Réactiver mon logement</EmailButton>
    </EmailLayout>
  )
}

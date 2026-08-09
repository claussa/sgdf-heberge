/** @jsxRuntime automatic @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import { EmailButton, EmailLayout, emailStyles, greeting } from './components/email-layout'

export interface RequestDeclinedEmailProps {
  requesterFirstName: string
  listingTitle: string
  actionUrl: string
}

/** Demande refusée → demandeur. Sobre et encourageant : on renvoie vers la recherche. */
export function RequestDeclinedEmail({
  requesterFirstName,
  listingTitle,
  actionUrl,
}: RequestDeclinedEmailProps) {
  return (
    <EmailLayout preview={`Ta demande pour « ${listingTitle} » n'a pas été retenue`}>
      <Heading as="h2" style={emailStyles.heading}>
        {greeting(requesterFirstName)}
      </Heading>
      <Text style={emailStyles.paragraph}>
        L'hébergeur n'a pas pu retenir ta demande pour « {listingTitle} ».
      </Text>
      <Text style={emailStyles.paragraph}>
        Rien de bloquant : cette réponse libère une de tes 3 sollicitations, et d'autres logements
        sont disponibles.
      </Text>
      <EmailButton href={actionUrl}>Chercher un autre logement</EmailButton>
    </EmailLayout>
  )
}

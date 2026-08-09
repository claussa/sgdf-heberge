/** @jsxRuntime automatic @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import { EmailLayout, emailStyles, greeting, InfoCard } from './components/email-layout'

export interface JumelageAcceptedEmailProps {
  toUnitName: string
  otherUnitName: string
  contactName: string
  contactEmail: string
  contactPhone: string
}

/**
 * Mise en relation acceptée → chacune des deux unités, avec le contact de l'autre.
 * Pas de bouton : la plateforme s'arrête ici, la suite se joue entre unités.
 */
export function JumelageAcceptedEmail({
  toUnitName,
  otherUnitName,
  contactName,
  contactEmail,
  contactPhone,
}: JumelageAcceptedEmailProps) {
  return (
    <EmailLayout preview={`Coordonnées échangées avec ${otherUnitName}`}>
      <Heading as="h2" style={emailStyles.heading}>
        {greeting(toUnitName)}
      </Heading>
      <Text style={emailStyles.paragraph}>
        Votre unité est désormais en relation avec {otherUnitName}. Voici votre contact :
      </Text>
      <InfoCard accent="success">
        <Text style={{ ...emailStyles.paragraph, fontWeight: 700, margin: '0 0 4px' }}>
          {contactName} — {otherUnitName}
        </Text>
        <Text style={{ ...emailStyles.paragraph, margin: 0 }}>
          {contactEmail} · {contactPhone}
        </Text>
      </InfoCard>
      <Text style={emailStyles.paragraph}>
        La plateforme s'arrête là : le lieu, le planning et l'organisation se règlent entre les deux
        unités.
      </Text>
    </EmailLayout>
  )
}

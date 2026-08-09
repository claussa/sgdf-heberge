/** @jsxRuntime automatic @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import {
  EmailButton,
  EmailLayout,
  emailStyles,
  greeting,
  InfoCard,
} from './components/email-layout'

export interface RequestAcceptedEmailProps {
  requesterFirstName: string
  hostFirstName: string
  hostLastName: string
  hostPhone: string
  hostEmail: string
  addressFull: string
  dateRange: string
  listingTitle: string
  actionUrl: string
}

/**
 * Demande acceptée → demandeur. C'est ICI (et seulement ici) que l'adresse complète
 * et les coordonnées de l'hébergeur sont transmises.
 */
export function RequestAcceptedEmail({
  requesterFirstName,
  hostFirstName,
  hostLastName,
  hostPhone,
  hostEmail,
  addressFull,
  dateRange,
  listingTitle,
  actionUrl,
}: RequestAcceptedEmailProps) {
  return (
    <EmailLayout preview={`${hostFirstName} ${hostLastName} a accepté ta demande`}>
      <Heading as="h2" style={emailStyles.heading}>
        {greeting(requesterFirstName)}
      </Heading>
      <Text style={emailStyles.paragraph}>
        Bonne nouvelle : {hostFirstName} {hostLastName} a accepté ta demande pour « {listingTitle} »
        ({dateRange}). Voici ses coordonnées :
      </Text>
      <InfoCard accent="success">
        <Text style={{ ...emailStyles.paragraph, fontWeight: 700, margin: '0 0 4px' }}>
          {hostFirstName} {hostLastName}
        </Text>
        <Text style={{ ...emailStyles.paragraph, margin: '0 0 4px' }}>
          {hostPhone} · {hostEmail}
        </Text>
        <Text style={{ ...emailStyles.paragraph, margin: 0 }}>{addressFull}</Text>
      </InfoCard>
      <Text style={emailStyles.paragraph}>
        Tes autres demandes en attente sont annulées automatiquement, et les hébergeurs concernés
        sont prévenus.
      </Text>
      <EmailButton href={actionUrl}>Suivre mes demandes</EmailButton>
      <Text style={emailStyles.muted}>
        L'annulation reste possible des deux côtés. Chacun est prévenu par e-mail.
      </Text>
    </EmailLayout>
  )
}

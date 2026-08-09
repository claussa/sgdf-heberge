/** @jsxRuntime automatic @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import {
  EmailButton,
  EmailLayout,
  emailStyles,
  greeting,
  QuoteBlock,
} from './components/email-layout'

export interface RequestReceivedEmailProps {
  hostFirstName: string
  requesterFirstName: string
  requesterLastName: string
  requesterPhone: string
  peopleCount: number
  dateRange: string
  listingTitle: string
  message: string
  actionUrl: string
}

/**
 * Nouvelle demande d'hébergement → hébergeur.
 * Le téléphone du demandeur est transmis d'emblée : c'est l'hébergeur qui rappelle,
 * le demandeur ne peut pas écrire en dehors de sa demande. Formulation neutre en genre :
 * on répète le prénom plutôt que « la/le contacter ».
 */
export function RequestReceivedEmail({
  hostFirstName,
  requesterFirstName,
  requesterLastName,
  requesterPhone,
  peopleCount,
  dateRange,
  listingTitle,
  message,
  actionUrl,
}: RequestReceivedEmailProps) {
  const people = `${peopleCount} ${peopleCount > 1 ? 'personnes' : 'personne'}`
  return (
    <EmailLayout preview={`${requesterFirstName} ${requesterLastName} · ${people} — ${dateRange}`}>
      <Heading as="h2" style={emailStyles.heading}>
        {greeting(hostFirstName)}
      </Heading>
      <Text style={emailStyles.paragraph}>
        Tu as reçu une nouvelle demande pour « {listingTitle} » :
      </Text>
      <Text style={{ ...emailStyles.paragraph, fontWeight: 700 }}>
        {requesterFirstName} {requesterLastName} · {people} — {dateRange}
      </Text>
      <QuoteBlock>{message}</QuoteBlock>
      <Text style={emailStyles.paragraph}>
        <strong>{requesterPhone}</strong> — c'est à toi de contacter {requesterFirstName}, qui ne
        peut pas t'écrire en dehors de sa demande.
      </Text>
      <EmailButton href={actionUrl}>Voir la demande</EmailButton>
      <Text style={emailStyles.muted}>
        Tu as 7 jours pour accepter, poser une question ou refuser. Sans action, la demande
        expirera.
      </Text>
    </EmailLayout>
  )
}

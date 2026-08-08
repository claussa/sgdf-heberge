/** @jsxRuntime automatic @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import { EmailButton, EmailLayout, emailStyles, greeting } from './components/email-layout'

export interface RequestReminderEmailProps {
  toFirstName: string
  listingTitle: string
  daysLeft: number
  actionUrl: string
}

/** Relance quotidienne → le côté dont on attend la réponse (hébergeur, ou demandeur questionné). */
export function RequestReminderEmail({
  toFirstName,
  listingTitle,
  daysLeft,
  actionUrl,
}: RequestReminderEmailProps) {
  const days = `${daysLeft} jour${daysLeft > 1 ? 's' : ''}`
  return (
    <EmailLayout preview={`Expire dans ${days} — ${listingTitle}`}>
      <Heading as="h2" style={emailStyles.heading}>
        {greeting(toFirstName)}
      </Heading>
      <Text style={emailStyles.paragraph}>
        Une demande concernant « {listingTitle} » attend ta réponse.
      </Text>
      <Text style={emailStyles.paragraph}>
        Sans action de ta part, la demande expirera dans <strong>{days}</strong>.
      </Text>
      <EmailButton href={actionUrl}>Voir la demande</EmailButton>
    </EmailLayout>
  )
}

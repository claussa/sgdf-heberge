/** @jsxRuntime automatic @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import {
  EmailButton,
  EmailLayout,
  emailStyles,
  greeting,
  QuoteBlock,
} from './components/email-layout'

export interface RequestMessageEmailProps {
  toFirstName: string
  fromName: string
  body: string
  actionUrl: string
}

/** Question ou réponse sur une demande → l'autre côté. Chaque message remet le délai à 7 jours. */
export function RequestMessageEmail({
  toFirstName,
  fromName,
  body,
  actionUrl,
}: RequestMessageEmailProps) {
  return (
    <EmailLayout preview={`${fromName} attend ta réponse`}>
      <Heading as="h2" style={emailStyles.heading}>
        {greeting(toFirstName)}
      </Heading>
      <Text style={emailStyles.paragraph}>
        {fromName} t'a écrit au sujet d'une demande d'hébergement :
      </Text>
      <QuoteBlock>{body}</QuoteBlock>
      <Text style={emailStyles.paragraph}>
        Le délai est remis à 7 jours : réponds quand tu peux, mais réponds.
      </Text>
      <EmailButton href={actionUrl}>Répondre</EmailButton>
    </EmailLayout>
  )
}

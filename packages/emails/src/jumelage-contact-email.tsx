/** @jsxRuntime automatic @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import {
  EmailButton,
  EmailLayout,
  emailStyles,
  greeting,
  QuoteBlock,
} from './components/email-layout'

export interface JumelageContactEmailProps {
  toUnitName: string
  fromUnitName: string
  fromBranch: string
  /** Préformaté, ex. « 18 jeunes + 3 chefs » ou « jusqu'à 30 personnes ». */
  peopleLabel: string
  message: string | null
  actionUrl: string
}

/** Demande de mise en relation → unité propriétaire de l'annonce. Registre « vous/nous ». */
export function JumelageContactEmail({
  toUnitName,
  fromUnitName,
  fromBranch,
  peopleLabel,
  message,
  actionUrl,
}: JumelageContactEmailProps) {
  return (
    <EmailLayout preview={`${fromUnitName} souhaite être mise en relation`}>
      <Heading as="h2" style={emailStyles.heading}>
        {greeting(toUnitName)}
      </Heading>
      <Text style={emailStyles.paragraph}>
        {fromUnitName} ({fromBranch}) souhaite être mise en relation avec vous.
      </Text>
      <Text style={emailStyles.paragraph}>L'unité annonce : {peopleLabel}.</Text>
      {message ? (
        <>
          <Text style={emailStyles.paragraph}>Leur message :</Text>
          <QuoteBlock>{message}</QuoteBlock>
        </>
      ) : null}
      <Text style={emailStyles.paragraph}>
        Si vous acceptez, chaque unité reçoit l'e-mail et le téléphone de l'autre.
      </Text>
      <EmailButton href={actionUrl}>Voir la demande</EmailButton>
      <Text style={emailStyles.muted}>
        Une demande non acceptée reste simplement sans suite : ni refus, ni expiration.
      </Text>
    </EmailLayout>
  )
}

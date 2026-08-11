/** @jsxRuntime automatic @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import {
  EmailButton,
  EmailLayout,
  emailStyles,
  greeting,
  InfoCard,
} from './components/email-layout'

export interface JumelageAcceptedEmailProps {
  toUnitName: string
  otherUnitName: string
  contactName: string
  contactEmail: string
  contactPhone: string
  /**
   * Lien vers l'espace jumelage pour retirer son annonce (null si l'unité n'a
   * plus d'annonce ACTIVE — le bouton n'a alors rien à retirer).
   */
  withdrawUrl: string | null
}

/**
 * Mise en relation acceptée → chacune des deux unités, avec le contact de l'autre.
 * La plateforme s'arrête ici, la suite se joue entre unités — mais l'annonce reste
 * ACTIVE (multi-jumelage) : on propose donc de la retirer pour ne plus recevoir
 * de demandes. Le bouton mène à la page (action confirmée là-bas), jamais à un
 * GET à effet de bord.
 */
export function JumelageAcceptedEmail({
  toUnitName,
  otherUnitName,
  contactName,
  contactEmail,
  contactPhone,
  withdrawUrl,
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
      {withdrawUrl ? (
        <>
          <Text style={emailStyles.paragraph}>
            Votre annonce reste visible : si vous ne souhaitez plus recevoir de demandes de
            jumelage, vous pouvez la retirer.
          </Text>
          <EmailButton href={withdrawUrl}>Retirer notre annonce</EmailButton>
          <Text style={emailStyles.muted}>
            Les mises en relation déjà acceptées restent acquises.
          </Text>
        </>
      ) : null}
    </EmailLayout>
  )
}

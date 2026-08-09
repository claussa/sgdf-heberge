/** @jsxRuntime automatic @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import { EmailButton, EmailLayout, emailStyles, greeting } from './components/email-layout'

export interface MagicLinkEmailProps {
  /** Nullable : les comptes coquilles n'ont pas encore de prénom. */
  firstName?: string | null
  url: string
}

/**
 * Email de connexion (magic link, §9 du CLAUDE.md).
 * ⚠️ Chemin critique : c'est LE mécanisme d'authentification, pas une notification.
 * Registre « vous » : ce mail part à tous les types de comptes (bénévoles comme unités).
 * Le texte avertit explicitement de ne pas transférer le message (risque résiduel accepté §9).
 */
export function MagicLinkEmail({ firstName, url }: MagicLinkEmailProps) {
  return (
    <EmailLayout preview="Votre lien de connexion — valable 10 minutes">
      <Heading as="h2" style={emailStyles.heading}>
        {greeting(firstName)}
      </Heading>
      <Text style={emailStyles.paragraph}>
        Voici votre lien de connexion. Ce lien est valable <strong>10 minutes</strong>.
      </Text>
      <EmailButton href={url}>Me connecter</EmailButton>
      <Text style={emailStyles.muted}>
        <strong>Ne transférez pas ce message :</strong> ce lien permet de se connecter à votre
        compte.
      </Text>
      <Text style={emailStyles.muted}>
        Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail — votre
        compte reste protégé.
      </Text>
    </EmailLayout>
  )
}

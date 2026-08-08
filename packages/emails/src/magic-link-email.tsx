/** @jsxRuntime automatic @jsxImportSource react */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export interface MagicLinkEmailProps {
  firstName: string
  url: string
}

/**
 * Email de connexion (magic link, §9).
 * ⚠️ Chemin critique : c'est LE mécanisme d'authentification, pas une notification.
 * Le texte avertit explicitement de ne pas transférer le message (risque résiduel accepté §9).
 */
export function MagicLinkEmail({ firstName, url }: MagicLinkEmailProps) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>Votre lien de connexion — valable 10 minutes</Preview>
      <Body style={{ backgroundColor: '#f5f5f4', fontFamily: 'Arial, sans-serif' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            margin: '32px auto',
            maxWidth: '480px',
            padding: '32px',
          }}
        >
          <Heading as="h2" style={{ fontSize: '20px', marginTop: 0 }}>
            Bonjour {firstName},
          </Heading>
          <Text>
            Voici votre lien de connexion à l'espace adhérents. Il est valable{' '}
            <strong>10 minutes</strong>.
          </Text>
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button
              href={url}
              style={{
                backgroundColor: '#1d4ed8',
                borderRadius: '6px',
                color: '#ffffff',
                display: 'inline-block',
                fontSize: '16px',
                padding: '12px 24px',
                textDecoration: 'none',
              }}
            >
              Me connecter
            </Button>
          </Section>
          <Text style={{ color: '#78716c', fontSize: '13px' }}>
            <strong>Ne transférez pas ce message :</strong> toute personne disposant de ce lien peut
            se connecter à votre compte pendant sa durée de validité.
          </Text>
          <Text style={{ color: '#78716c', fontSize: '13px' }}>
            Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email — votre
            compte reste protégé.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

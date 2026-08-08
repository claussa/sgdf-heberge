/** @jsxRuntime automatic @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import { EmailButton, EmailLayout, emailStyles, greeting } from './components/email-layout'

export interface RequestExpiredEmailProps {
  toFirstName: string
  listingTitle: string
  /** true : version demandeur (quota libéré) ; false : version hébergeur (logement peut-être masqué). */
  forRequester: boolean
  actionUrl: string
}

/** Demande expirée (7 jours sans réponse) → les deux côtés, avec un contenu adapté à chacun. */
export function RequestExpiredEmail({
  toFirstName,
  listingTitle,
  forRequester,
  actionUrl,
}: RequestExpiredEmailProps) {
  return (
    <EmailLayout preview={`La demande concernant « ${listingTitle} » a expiré`}>
      <Heading as="h2" style={emailStyles.heading}>
        {greeting(toFirstName)}
      </Heading>
      <Text style={emailStyles.paragraph}>
        La demande concernant « {listingTitle} » a expiré : 7 jours sans réponse.
      </Text>
      {forRequester ? (
        <Text style={emailStyles.paragraph}>Cette demande libère une de tes 3 sollicitations.</Text>
      ) : (
        <Text style={emailStyles.paragraph}>
          Si aucune action n'a été faite sur cette période, ton logement a pu être masqué des
          recherches. Tu peux vérifier son état et le repasser en "libre" depuis ton espace.
        </Text>
      )}
      <EmailButton href={actionUrl}>
        {forRequester ? 'Chercher un autre logement' : 'Voir mon logement'}
      </EmailButton>
    </EmailLayout>
  )
}

/** @jsxRuntime automatic @jsxImportSource react */
import { render } from '@react-email/render'
import type { ReactElement } from 'react'
import { JumelageAcceptedEmail, type JumelageAcceptedEmailProps } from './jumelage-accepted-email'
import { JumelageContactEmail, type JumelageContactEmailProps } from './jumelage-contact-email'
import { ListingHiddenEmail, type ListingHiddenEmailProps } from './listing-hidden-email'
import { MagicLinkEmail, type MagicLinkEmailProps } from './magic-link-email'
import { RequestAcceptedEmail, type RequestAcceptedEmailProps } from './request-accepted-email'
import { RequestCancelledEmail, type RequestCancelledEmailProps } from './request-cancelled-email'
import { RequestDeclinedEmail, type RequestDeclinedEmailProps } from './request-declined-email'
import { RequestExpiredEmail, type RequestExpiredEmailProps } from './request-expired-email'
import { RequestMessageEmail, type RequestMessageEmailProps } from './request-message-email'
import { RequestReceivedEmail, type RequestReceivedEmailProps } from './request-received-email'
import { RequestReminderEmail, type RequestReminderEmailProps } from './request-reminder-email'

export * from './components/email-layout'
export * from './jumelage-accepted-email'
export * from './jumelage-contact-email'
export * from './listing-hidden-email'
export * from './magic-link-email'
export * from './request-accepted-email'
export * from './request-cancelled-email'
export * from './request-declined-email'
export * from './request-expired-email'
export * from './request-message-email'
export * from './request-received-email'
export * from './request-reminder-email'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

async function toRenderedEmail(subject: string, element: ReactElement): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}

/** Connexion par magic link — chemin critique : c'est LE mécanisme d'authentification (§9). */
export async function renderMagicLinkEmail(props: MagicLinkEmailProps): Promise<RenderedEmail> {
  return toRenderedEmail('Votre lien de connexion', <MagicLinkEmail {...props} />)
}

export async function renderRequestReceivedEmail(
  props: RequestReceivedEmailProps,
): Promise<RenderedEmail> {
  return toRenderedEmail("Nouvelle demande d'hébergement", <RequestReceivedEmail {...props} />)
}

export async function renderRequestAcceptedEmail(
  props: RequestAcceptedEmailProps,
): Promise<RenderedEmail> {
  return toRenderedEmail(
    'Demande acceptée — les coordonnées sont dans ce message',
    <RequestAcceptedEmail {...props} />,
  )
}

export async function renderRequestDeclinedEmail(
  props: RequestDeclinedEmailProps,
): Promise<RenderedEmail> {
  return toRenderedEmail("Ta demande n'a pas été retenue", <RequestDeclinedEmail {...props} />)
}

export async function renderRequestMessageEmail(
  props: RequestMessageEmailProps,
): Promise<RenderedEmail> {
  return toRenderedEmail(`Nouveau message de ${props.fromName}`, <RequestMessageEmail {...props} />)
}

export async function renderRequestReminderEmail(
  props: RequestReminderEmailProps,
): Promise<RenderedEmail> {
  return toRenderedEmail(
    `Réponse attendue : ${props.listingTitle}`,
    <RequestReminderEmail {...props} />,
  )
}

export async function renderRequestExpiredEmail(
  props: RequestExpiredEmailProps,
): Promise<RenderedEmail> {
  return toRenderedEmail(
    `Demande expirée — ${props.listingTitle}`,
    <RequestExpiredEmail {...props} />,
  )
}

export async function renderRequestCancelledEmail(
  props: RequestCancelledEmailProps,
): Promise<RenderedEmail> {
  return toRenderedEmail(
    `Demande annulée — ${props.listingTitle}`,
    <RequestCancelledEmail {...props} />,
  )
}

export async function renderListingHiddenEmail(
  props: ListingHiddenEmailProps,
): Promise<RenderedEmail> {
  return toRenderedEmail('Ton logement a été masqué', <ListingHiddenEmail {...props} />)
}

export async function renderJumelageContactEmail(
  props: JumelageContactEmailProps,
): Promise<RenderedEmail> {
  return toRenderedEmail(
    'Votre annonce de jumelage a une réponse',
    <JumelageContactEmail {...props} />,
  )
}

export async function renderJumelageAcceptedEmail(
  props: JumelageAcceptedEmailProps,
): Promise<RenderedEmail> {
  return toRenderedEmail(
    'Mise en relation acceptée — les coordonnées sont dans ce message',
    <JumelageAcceptedEmail {...props} />,
  )
}

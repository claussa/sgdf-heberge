/** @jsxRuntime automatic @jsxImportSource react */
import { render } from '@react-email/render'
import { MagicLinkEmail, type MagicLinkEmailProps } from './magic-link-email'

export { MagicLinkEmail, type MagicLinkEmailProps }

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export async function renderMagicLinkEmail(props: MagicLinkEmailProps): Promise<RenderedEmail> {
  const element = <MagicLinkEmail {...props} />
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return {
    subject: 'Votre lien de connexion',
    html,
    text,
  }
}

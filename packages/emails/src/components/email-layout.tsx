/** @jsxRuntime automatic @jsxImportSource react */
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { eventConfig } from '@repo/event-config'
import type { CSSProperties, ReactNode } from 'react'

/**
 * Layout partagé de tous les emails de la plateforme.
 *
 * Charte (docs/design/rapport-maquette.md §C) : bleu institutionnel #003a5d en bandeau,
 * angles carrés (aucun border-radius), filets 1px rgba(0,58,93,.16), secondaire #66899e.
 * Styles inline uniquement (clients mail). Pas d'image : les clients bloquent les images
 * distantes, le wordmark est donc en texte.
 */

const FONT_STACK = 'Sarabun, Arial, sans-serif'

export const emailStyles = {
  heading: {
    color: '#003a5d',
    fontSize: '20px',
    fontWeight: 700,
    lineHeight: '1.3',
    margin: '0 0 16px',
  },
  paragraph: {
    color: '#003a5d',
    fontSize: '14px',
    lineHeight: '1.6',
    margin: '0 0 12px',
  },
  muted: {
    color: '#66899e',
    fontSize: '13px',
    lineHeight: '1.5',
    margin: '0 0 8px',
  },
} satisfies Record<string, CSSProperties>

/** « Bonjour Marie, » — ou « Bonjour, » quand le prénom est inconnu (comptes coquilles). */
export function greeting(name?: string | null): string {
  return name ? `Bonjour ${name},` : 'Bonjour,'
}

export interface EmailLayoutProps {
  preview: string
  children: ReactNode
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: '#e0e7ec',
          fontFamily: FONT_STACK,
          margin: 0,
          padding: '24px 12px',
        }}
      >
        <Container
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid rgba(0,58,93,.16)',
            borderRadius: 0,
            margin: '0 auto',
            maxWidth: '480px',
          }}
        >
          <Section style={{ backgroundColor: '#003a5d', padding: '20px 32px' }}>
            <Text style={{ color: '#ffffff', fontSize: '22px', fontWeight: 700, margin: 0 }}>
              {eventConfig.appName}
            </Text>
            <Text
              style={{
                color: 'rgba(255,255,255,.72)',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '.12em',
                margin: '4px 0 0',
                textTransform: 'uppercase',
              }}
            >
              {eventConfig.eyebrow}
            </Text>
          </Section>
          <Section style={{ padding: '28px 32px 16px' }}>{children}</Section>
          <Section style={{ borderTop: '1px solid rgba(0,58,93,.16)', padding: '16px 32px 24px' }}>
            <Text style={{ color: '#66899e', fontSize: '12px', lineHeight: '1.5', margin: 0 }}>
              {eventConfig.organizer} — {eventConfig.organizerAddress}
            </Text>
            <Text
              style={{ color: '#66899e', fontSize: '12px', lineHeight: '1.5', margin: '4px 0 0' }}
            >
              Cet e-mail concerne « {eventConfig.name} ».
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

/** Bouton primaire charte : fond #003a5d, texte blanc, angles carrés. */
export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: '24px 0', textAlign: 'center' }}>
      <Button
        href={href}
        style={{
          backgroundColor: '#003a5d',
          borderRadius: 0,
          color: '#ffffff',
          display: 'inline-block',
          fontSize: '14px',
          fontWeight: 700,
          padding: '14px 28px',
          textDecoration: 'none',
        }}
      >
        {children}
      </Button>
    </Section>
  )
}

/** Citation d'un message utilisateur : guillemets français, filet vertical à gauche. */
export function QuoteBlock({ children }: { children: ReactNode }) {
  return (
    <Section
      style={{
        borderLeft: '3px solid rgba(0,58,93,.16)',
        margin: '4px 0 16px',
        paddingLeft: '14px',
      }}
    >
      <Text style={{ color: '#003a5d', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
        « {children} »
      </Text>
    </Section>
  )
}

/** Encadré d'information (coordonnées…) ; accent « success » = bord supérieur 6px vert charte. */
export function InfoCard({ accent, children }: { accent?: 'success'; children: ReactNode }) {
  return (
    <Section
      style={{
        border: '1px solid rgba(0,58,93,.16)',
        borderTop: accent === 'success' ? '6px solid #007254' : '1px solid rgba(0,58,93,.16)',
        margin: '8px 0 16px',
        padding: '14px 16px',
      }}
    >
      {children}
    </Section>
  )
}

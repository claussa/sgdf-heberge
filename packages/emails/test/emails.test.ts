import { eventConfig } from '@repo/event-config'
import { describe, expect, it } from 'vitest'
import {
  type RenderedEmail,
  renderJumelageAcceptedEmail,
  renderJumelageContactEmail,
  renderListingHiddenEmail,
  renderMagicLinkEmail,
  renderRequestAcceptedEmail,
  renderRequestCancelledEmail,
  renderRequestDeclinedEmail,
  renderRequestExpiredEmail,
  renderRequestMessageEmail,
  renderRequestReceivedEmail,
  renderRequestReminderEmail,
} from '../src/index'

const BASE = 'https://hebergement.exemple.fr'

/**
 * ⚠️ React échappe " et ' en entités dans le HTML rendu (&quot; / &#x27;).
 * Les chaînes attendues ci-dessous évitent donc les apostrophes, et les guillemets
 * droits sont attendus sous leur forme échappée.
 */
interface EmailCase {
  render: () => Promise<RenderedEmail>
  /** Chaînes qui doivent apparaître dans le HTML rendu */
  expectHtml: string[]
  /** Chaînes interdites dans le HTML rendu */
  forbidHtml?: string[]
  /** Sous-chaîne attendue dans le sujet */
  expectSubject?: string
}

const cases: Record<string, EmailCase> = {
  'magic-link': {
    render: () =>
      renderMagicLinkEmail({ firstName: 'Marie', url: `${BASE}/api/auth/callback?token=tok-test` }),
    expectHtml: [
      'Bonjour Marie,',
      '10 minutes',
      'Ne transférez pas ce message',
      `${BASE}/api/auth/callback?token=tok-test`,
      'Me connecter',
    ],
    forbidHtml: ['30 minutes', 'usage unique'],
    expectSubject: 'Votre lien de connexion',
  },
  'magic-link sans prénom (compte coquille)': {
    render: () =>
      renderMagicLinkEmail({ firstName: null, url: `${BASE}/api/auth/callback?token=tok-nul` }),
    expectHtml: ['Bonjour,', '10 minutes', 'Ne transférez pas ce message'],
    forbidHtml: ['30 minutes', 'usage unique'],
  },
  'request-received': {
    render: () =>
      renderRequestReceivedEmail({
        hostFirstName: 'Claire',
        requesterFirstName: 'Marie',
        requesterLastName: 'Lefèvre',
        requesterPhone: '06 98 76 54 32',
        peopleCount: 3,
        dateRange: 'du 25 au 28 septembre',
        listingTitle: 'Chambre privée · 2 places',
        message: 'Bonjour Claire, nous sommes trois bénévoles au service accueil.',
        actionUrl: `${BASE}/hebergeur/demandes`,
      }),
    expectHtml: [
      'Bonjour Claire,',
      '06 98 76 54 32',
      'contacter Marie',
      '3 personnes',
      'du 25 au 28 septembre',
      'Chambre privée · 2 places',
      'nous sommes trois bénévoles',
      'Voir la demande',
    ],
    expectSubject: "Nouvelle demande d'hébergement",
  },
  'request-accepted': {
    render: () =>
      renderRequestAcceptedEmail({
        requesterFirstName: 'Marie',
        hostFirstName: 'Claire',
        hostLastName: 'Martin',
        hostPhone: '06 12 34 56 78',
        hostEmail: 'claire@exemple.fr',
        addressFull: '12 rue des Boulets, 75012 Paris',
        dateRange: 'du 25 au 28 septembre',
        listingTitle: 'Chambre chez Claire',
        actionUrl: `${BASE}/mes-demandes`,
      }),
    expectHtml: [
      'Claire Martin',
      '06 12 34 56 78',
      'claire@exemple.fr',
      '12 rue des Boulets, 75012 Paris',
      'des deux côtés',
    ],
    expectSubject: 'Demande acceptée',
  },
  'request-declined': {
    render: () =>
      renderRequestDeclinedEmail({
        requesterFirstName: 'Marie',
        listingTitle: 'Couchage sommaire · Montreuil',
        actionUrl: `${BASE}/recherche`,
      }),
    expectHtml: ['Couchage sommaire · Montreuil', 'sollicitations', 'Chercher un autre logement'],
    expectSubject: 'pas été retenue',
  },
  'request-message': {
    render: () =>
      renderRequestMessageEmail({
        toFirstName: 'Marie',
        fromName: 'Claire Martin',
        body: 'Vous arrivez avant 20 h ?',
        actionUrl: `${BASE}/mes-demandes`,
      }),
    expectHtml: ['Vous arrivez avant 20 h ?', 'remis à 7 jours', 'Répondre'],
    expectSubject: 'Nouveau message de Claire Martin',
  },
  'request-reminder (pluriel)': {
    render: () =>
      renderRequestReminderEmail({
        toFirstName: 'Claire',
        listingTitle: 'Chambre privée · 2 places',
        daysLeft: 2,
        actionUrl: `${BASE}/hebergeur/demandes`,
      }),
    expectHtml: ['expirera dans', '2 jours', 'Voir la demande'],
    expectSubject: 'Réponse attendue : Chambre privée',
  },
  'request-reminder (singulier)': {
    render: () =>
      renderRequestReminderEmail({
        toFirstName: 'Claire',
        listingTitle: 'Chambre privée · 2 places',
        daysLeft: 1,
        actionUrl: `${BASE}/hebergeur/demandes`,
      }),
    expectHtml: ['1 jour'],
    forbidHtml: ['1 jours'],
  },
  'request-expired (demandeur)': {
    render: () =>
      renderRequestExpiredEmail({
        toFirstName: 'Marie',
        listingTitle: 'Emplacement tente · Vincennes',
        forRequester: true,
        actionUrl: `${BASE}/recherche`,
      }),
    expectHtml: ['libère une de tes 3 sollicitations', 'Chercher un autre logement'],
    expectSubject: 'Demande expirée',
  },
  'request-expired (hébergeur)': {
    render: () =>
      renderRequestExpiredEmail({
        toFirstName: 'Claire',
        listingTitle: 'Chambre privée · 2 places',
        forRequester: false,
        actionUrl: `${BASE}/hebergeur/logements`,
      }),
    expectHtml: ['a pu être masqué des recherches', '&quot;libre&quot;', 'Voir mon logement'],
    forbidHtml: ['sollicitations'],
  },
  'request-cancelled (automatique)': {
    render: () =>
      renderRequestCancelledEmail({
        toFirstName: 'Claire',
        listingTitle: 'Chambre chez Claire',
        cancelledByLabel: 'automatiquement : le demandeur a été accepté ailleurs',
        actionUrl: `${BASE}/hebergeur/demandes`,
      }),
    expectHtml: ['a été annulée', 'accepté ailleurs', 'Ouvrir mon espace'],
    expectSubject: 'Demande annulée',
  },
  'request-cancelled (sans prénom)': {
    render: () =>
      renderRequestCancelledEmail({
        toFirstName: null,
        listingTitle: 'Chambre chez Claire',
        cancelledByLabel: 'le demandeur',
        actionUrl: `${BASE}/hebergeur/demandes`,
      }),
    expectHtml: ['Bonjour,', 'le demandeur'],
  },
  'listing-hidden': {
    render: () =>
      renderListingHiddenEmail({
        hostFirstName: 'Claire',
        listingTitle: 'Chez Claire',
        actionUrl: `${BASE}/hebergeur/logements`,
      }),
    expectHtml: [
      'Sans action pendant 7 jours',
      'a été masqué des recherches',
      '&quot;libre&quot;',
      'Réactiver mon logement',
    ],
    expectSubject: 'Ton logement a été masqué',
  },
  'jumelage-contact': {
    render: () =>
      renderJumelageContactEmail({
        toUnitName: '3e Metz Saint-Éloy',
        fromUnitName: '1re Nancy',
        fromBranch: 'Pionniers-Caravelles',
        peopleLabel: '18 jeunes + 3 chefs',
        message: 'Nous venons pour le service liturgie, nous avons notre matériel de cuisine.',
        actionUrl: `${BASE}/unite/relations`,
      }),
    expectHtml: [
      '1re Nancy',
      'Pionniers-Caravelles',
      'mise en relation avec vous',
      '18 jeunes + 3 chefs',
      'service liturgie',
      'Voir la demande',
    ],
    expectSubject: 'Votre annonce de jumelage a une réponse',
  },
  'jumelage-contact (sans message)': {
    render: () =>
      renderJumelageContactEmail({
        toUnitName: '3e Metz Saint-Éloy',
        fromUnitName: '1re Woippy',
        fromBranch: 'Pionniers-Caravelles',
        peopleLabel: "jusqu'à 25 personnes",
        message: null,
        actionUrl: `${BASE}/unite/relations`,
      }),
    expectHtml: ['1re Woippy', '25 personnes'],
    forbidHtml: ['Leur message'],
  },
  'jumelage-accepted': {
    render: () =>
      renderJumelageAcceptedEmail({
        toUnitName: '1re Nancy',
        otherUnitName: '3e Metz Saint-Éloy',
        contactName: 'Paul Girard',
        contactEmail: 'saint.eloy@exemple.fr',
        contactPhone: '06 22 33 44 55',
      }),
    expectHtml: [
      'Paul Girard',
      'saint.eloy@exemple.fr',
      '06 22 33 44 55',
      'arrête là',
      'entre les deux unités',
    ],
    expectSubject: 'Mise en relation acceptée',
  },
}

/** React sépare texte et expressions JSX par des commentaires `<!-- -->` : on les retire pour
 * que les assertions puissent chevaucher ces frontières (« contacter Marie », « Claire Martin »). */
function normalizeHtml(html: string): string {
  return html.replaceAll('<!-- -->', '')
}

describe('templates emails', () => {
  for (const [name, emailCase] of Object.entries(cases)) {
    describe(name, () => {
      it('rend un sujet, un html et un texte conformes', async () => {
        const { subject, html: rawHtml, text } = await emailCase.render()
        const html = normalizeHtml(rawHtml)
        expect(subject.trim().length).toBeGreaterThan(0)
        if (emailCase.expectSubject) expect(subject).toContain(emailCase.expectSubject)
        for (const expected of emailCase.expectHtml) expect(html).toContain(expected)
        for (const forbidden of emailCase.forbidHtml ?? []) expect(html).not.toContain(forbidden)
        expect(text.trim().length).toBeGreaterThan(0)
      })

      it('utilise le layout charte', async () => {
        const { html: rawHtml } = await emailCase.render()
        const html = normalizeHtml(rawHtml)
        expect(html).toContain(eventConfig.appName)
        expect(html).toContain(eventConfig.eyebrow)
        expect(html).toContain(eventConfig.organizer)
        expect(html).toContain(eventConfig.name)
        expect(html).toContain('Cet e-mail concerne')
        expect(html).toContain('#003a5d')
        // Ancien bouton bleu arrondi pré-charte : ne doit plus apparaître nulle part.
        expect(html).not.toContain('#1d4ed8')
      })
    })
  }

  it('aucun template ne contient d’emoji', async () => {
    const emoji = /\p{Extended_Pictographic}/u
    for (const [name, emailCase] of Object.entries(cases)) {
      const { subject, html, text } = await emailCase.render()
      expect(emoji.test(subject), `${name} : sujet`).toBe(false)
      expect(emoji.test(html), `${name} : html`).toBe(false)
      expect(emoji.test(text), `${name} : texte`).toBe(false)
    }
  })

  it('jumelage-accepted ne contient aucun lien ni bouton', async () => {
    const { html } = await renderJumelageAcceptedEmail({
      toUnitName: '1re Nancy',
      otherUnitName: '3e Metz Saint-Éloy',
      contactName: 'Paul Girard',
      contactEmail: 'saint.eloy@exemple.fr',
      contactPhone: '06 22 33 44 55',
    })
    expect(html).not.toContain('</a>')
  })
})

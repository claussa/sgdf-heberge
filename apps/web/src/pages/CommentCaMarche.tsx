import {
  type RenderedEmail,
  renderJumelageAcceptedEmail,
  renderJumelageContactEmail,
  renderMagicLinkEmail,
  renderRequestAcceptedEmail,
  renderRequestReceivedEmail,
} from '@repo/emails'
import { eventConfig, formatDateRangeShort } from '@repo/event-config'
import { type ReactNode, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ChoiceCard } from '../components/ChoiceCard'
import { Card, HelpText, PageTitle, SectionTitle, SigneMask, type SigneName } from '../ui'
import './explication.css'

type Choice = 'volontaire' | 'unite'

const SITES_LABEL = eventConfig.sites.map((site) => site.label).join(', ')
const DATE_RANGE = formatDateRangeShort(eventConfig.dates.start, eventConfig.dates.end)
const APP_URL = window.location.origin

/**
 * Exemples d'e-mails : les VRAIS templates de packages/emails, rendus dans le
 * navigateur avec des personnes et unités fictives — la page reste ainsi alignée
 * sur ce que la plateforme envoie réellement. Loaders au niveau module :
 * référence stable pour l'effet de <EmailPreview>.
 */
const SAMPLE_EMAILS = {
  magicLink: () => renderMagicLinkEmail({ firstName: null, url: `${APP_URL}/connexion` }),
  requestReceived: () =>
    renderRequestReceivedEmail({
      hostFirstName: 'Dominique',
      requesterFirstName: 'Camille',
      requesterLastName: 'Martin',
      requesterPhone: '06 12 34 56 78',
      peopleCount: 2,
      dateRange: DATE_RANGE,
      listingTitle: 'Chambre avec deux lits simples',
      message:
        'Bonjour, nous venons à deux comme volontaires. Nous arrivons en train le premier soir, plutôt tard. Merci !',
      actionUrl: `${APP_URL}/hebergeur/demandes`,
    }),
  requestAccepted: () =>
    renderRequestAcceptedEmail({
      requesterFirstName: 'Camille',
      hostFirstName: 'Dominique',
      hostLastName: 'Bernard',
      hostPhone: '06 98 76 54 32',
      hostEmail: 'dominique.bernard@exemple.fr',
      addressFull: '14 rue des Tilleuls',
      dateRange: DATE_RANGE,
      listingTitle: 'Chambre avec deux lits simples',
      actionUrl: `${APP_URL}/mes-demandes`,
    }),
  jumelageContact: () =>
    renderJumelageContactEmail({
      toUnitName: 'Scouts et Guides du Vieux Moulin',
      fromUnitName: 'Pionniers de la Colline',
      fromBranch: eventConfig.unitBranches[3] ?? eventConfig.unitBranches[0] ?? '',
      peopleLabel: '18 jeunes + 3 chefs',
      message:
        'Bonjour ! Nous cherchons une unité pour nous accueillir avec nos tentes. Nous sommes autonomes pour les repas.',
      actionUrl: `${APP_URL}/unite/relations`,
    }),
  jumelageAccepted: () =>
    renderJumelageAcceptedEmail({
      toUnitName: 'Pionniers de la Colline',
      otherUnitName: 'Scouts et Guides du Vieux Moulin',
      contactName: 'Alex Fournier',
      contactEmail: 'alex.fournier@exemple.fr',
      contactPhone: '06 12 34 56 78',
      withdrawUrl: `${APP_URL}/unite/annonce`,
    }),
} satisfies Record<string, () => Promise<RenderedEmail>>

type EmailPreviewProps = {
  /** Qui reçoit cet e-mail — affiché dans le bandeau de l'aperçu. */
  note: string
  load: () => Promise<RenderedEmail>
}

/**
 * Aperçu d'un e-mail réel dans une iframe inerte (pointer-events: none, sandbox
 * sans script) redimensionnée à son contenu. srcDoc + allow-same-origin : le
 * document reste lisible pour la mesure de hauteur.
 */
function EmailPreview({ note, load }: EmailPreviewProps) {
  const [email, setEmail] = useState<RenderedEmail | null>(null)
  const [height, setHeight] = useState(380)

  useEffect(() => {
    let alive = true
    load().then((rendered) => {
      if (alive) setEmail(rendered)
    })
    return () => {
      alive = false
    }
  }, [load])

  return (
    <figure className="email-preview">
      <figcaption className="email-preview__chrome">
        <span className="email-preview__note">{note}</span>
        {email && <span className="email-preview__subject">Objet : {email.subject}</span>}
      </figcaption>
      {email ? (
        <iframe
          title={`Aperçu — ${email.subject}`}
          className="email-preview__frame"
          srcDoc={email.html}
          sandbox="allow-same-origin"
          style={{ height }}
          onLoad={(event) => {
            const doc = event.currentTarget.contentDocument
            if (doc) setHeight(doc.documentElement.scrollHeight)
          }}
        />
      ) : (
        <div className="email-preview__loading">Chargement de l’aperçu…</div>
      )}
    </figure>
  )
}

type StepProps = {
  signe: SigneName
  title: string
  children: ReactNode
}

/** Jalon du chemin pointillé (même vocabulaire visuel que les « autres routes » de la connexion). */
function Step({ signe, title, children }: StepProps) {
  return (
    <div className="ccm-step">
      <span className="ccm-step__signe-box" aria-hidden="true">
        <SigneMask name={signe} className="ccm-step__signe" />
      </span>
      <div className="ccm-step__body">
        <h3 className="ccm-step__title">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function ParcoursVolontaire() {
  return (
    <section className="ccm__flow fade" aria-label="Parcours volontaire ou participant">
      <SectionTitle>Ton parcours, étape par étape</SectionTitle>
      <div className="ccm-chemin">
        <Step signe="etoile" title="Connecte-toi en un clic">
          <p className="ccm-step__text">
            Tu saisis ton e-mail, on t’envoie un lien de connexion valable 10 minutes — pas de mot
            de passe à retenir. Première visite ? Le lien crée ton compte, tout simplement.
          </p>
          <EmailPreview note="L’e-mail de connexion" load={SAMPLE_EMAILS.magicLink} />
        </Step>
        <Step signe="fleche" title="Cherche un logement">
          <p className="ccm-step__text">
            Filtre par site ({SITES_LABEL}), dates et nombre de personnes — et, si besoin, n’affiche
            que les logements compatibles avec tes besoins d’accessibilité. Sur les cartes, seul le
            quartier est affiché : l’adresse complète t’est transmise quand l’hébergeur accepte.
          </p>
        </Step>
        <Step signe="tente" title="Envoie une demande — 3 en attente maximum">
          <p className="ccm-step__text">
            Tu accompagnes ta demande d’un petit message. L’hébergeur la reçoit aussitôt par e-mail,
            avec ton téléphone : c’est lui qui te contacte pour faire connaissance. Pour en envoyer
            une quatrième, annule une demande en attente ou attends une réponse.
          </p>
          <EmailPreview note="Ce que reçoit l’hébergeur" load={SAMPLE_EMAILS.requestReceived} />
        </Step>
        <Step signe="campement" title="L’hébergeur a 7 jours pour répondre">
          <p className="ccm-step__text">
            Trois réponses possibles : accepter, poser une question — tu y réponds depuis « Mes
            demandes », et le délai repart à 7 jours — ou refuser. Sans réponse au bout de 7 jours,
            la demande expire et libère ta place. Tu reçois un e-mail à chaque réponse — pas besoin
            de guetter.
          </p>
        </Step>
        <Step signe="soleil" title="Acceptée : les coordonnées arrivent">
          <p className="ccm-step__text">
            L’adresse complète et le téléphone de l’hébergeur t’arrivent par e-mail et apparaissent
            dans l’onglet « Acceptées ». Tes autres demandes en attente sont annulées
            automatiquement — aucun hébergeur ne reste suspendu à ta réponse.
          </p>
          <EmailPreview
            note="Ce que tu reçois à l’acceptation"
            load={SAMPLE_EMAILS.requestAccepted}
          />
        </Step>
      </div>
      <Card accentTop="brand" className="ccm-encart">
        <h3 className="ccm-encart__title">Tu proposes un logement ?</h3>
        <p className="ccm-step__text">
          Le même compte te permet d’accueillir. Tu décris tes couchages et l’accessibilité de ton
          logement ; chaque demande t’arrive par e-mail avec le téléphone de la personne, et tu
          réponds — accepter, poser une question ou refuser — sous 7 jours. Ton adresse complète
          n’est transmise qu’aux personnes que tu acceptes, et tu peux passer un logement en «
          Complet » à tout moment.
        </p>
      </Card>
    </section>
  )
}

function ParcoursUnite() {
  return (
    <section className="ccm__flow fade" aria-label="Parcours unité scoute">
      <SectionTitle>Votre jumelage, étape par étape</SectionTitle>
      <div className="ccm-chemin">
        <Step signe="etoile" title="Connectez-vous en un clic">
          <p className="ccm-step__text">
            Vous saisissez l’e-mail du responsable, on vous envoie un lien de connexion valable 10
            minutes — pas de mot de passe. Première visite ? Le lien crée le compte de l’unité.
          </p>
          <EmailPreview note="L’e-mail de connexion" load={SAMPLE_EMAILS.magicLink} />
        </Step>
        <Step signe="campement" title="Publiez votre annonce">
          <p className="ccm-step__text">
            Une annonce par unité, dans un sens ou dans l’autre : « nous cherchons une unité sur
            place » ou « nous pouvons en accueillir une ». Elle est visible des unités du sens
            opposé sur le même site ({SITES_LABEL}).
          </p>
        </Step>
        <Step signe="paix" title="Contactez une unité — ou soyez contactés">
          <p className="ccm-step__text">
            La mise en relation marche dans les deux sens : vous écrivez aux unités dont l’annonce
            vous intéresse, et celles qui voient la vôtre peuvent aussi vous écrire. Vous recevez un
            e-mail à chaque demande — pas besoin de guetter.
          </p>
          <EmailPreview
            note="Ce que reçoit l’unité contactée"
            load={SAMPLE_EMAILS.jumelageContact}
          />
        </Step>
        <Step signe="soleil" title="Acceptez : coordonnées échangées">
          <p className="ccm-step__text">
            Les deux unités reçoivent chacune l’e-mail et le téléphone du responsable de l’autre. La
            plateforme s’arrête là : le lieu, le planning et l’organisation se règlent entre vous.
            Une demande que vous n’acceptez pas reste simplement sans suite — ni refus, ni
            expiration — et une unité peut être jumelée plusieurs fois.
          </p>
          <EmailPreview
            note="Ce que reçoivent les deux unités"
            load={SAMPLE_EMAILS.jumelageAccepted}
          />
        </Step>
      </div>
      <Card accentTop="brand" className="ccm-encart">
        <h3 className="ccm-encart__title">Jumelage conclu ?</h3>
        <p className="ccm-step__text">
          Retirez votre annonce pour ne plus recevoir de demandes : les mises en relation déjà
          acceptées restent acquises, et l’annonce peut être republiée plus tard.
        </p>
      </Card>
    </section>
  )
}

/**
 * Page publique « Comment ça marche » : le visiteur choisit son profil
 * (volontaire/participant ou unité scoute) et découvre le parcours correspondant,
 * illustré par les e-mails réellement envoyés par la plateforme. Le choix vit dans
 * l'URL (?profil=…) pour être partageable.
 */
export function CommentCaMarche() {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('profil')
  const choice: Choice | null = raw === 'volontaire' || raw === 'unite' ? raw : null

  return (
    <div className="ccm fade">
      <PageTitle>Comment ça marche,</PageTitle>
      <p className="text-body">
        La plateforme met en relation ceux qui cherchent un toit pour «&nbsp;{eventConfig.name}
        &nbsp;» ({eventConfig.dates.label}) et ceux qui ouvrent leur porte. Dites-nous qui vous
        êtes, on vous explique le fonctionnement — e-mails compris.
      </p>
      <div className="ccm__choices">
        <ChoiceCard
          name="ccm-profil"
          selected={choice === 'volontaire'}
          onSelect={() => setSearchParams({ profil: 'volontaire' }, { replace: true })}
          title="Volontaire ou participant"
          text="Seul ou en petit groupe : je cherche où dormir, ou je propose un logement."
        />
        <ChoiceCard
          name="ccm-profil"
          selected={choice === 'unite'}
          onSelect={() => setSearchParams({ profil: 'unite' }, { replace: true })}
          title="Unité scoute"
          text="Jumelage : nous cherchons une unité sur place, ou nous pouvons en accueillir une."
        />
      </div>
      {eventConfig.guidePdf && (
        <Card className="ccm-pdf">
          <span className="ccm-pdf__signe-box" aria-hidden="true">
            <SigneMask name="fleche" className="ccm-pdf__signe" />
          </span>
          <div className="ccm-pdf__body">
            <h2 className="ccm-pdf__title">La notice existe aussi en PDF</h2>
            <p className="ccm-step__text">
              Le mode opératoire illustré, capture d’écran par capture d’écran — pratique à imprimer
              ou à transférer à quelqu’un qui découvre la plateforme.
            </p>
            <p className="ccm-pdf__action">
              <a href={eventConfig.guidePdf.href} target="_blank" rel="noreferrer">
                {eventConfig.guidePdf.label}
              </a>
              <span className="ccm-pdf__meta">{eventConfig.guidePdf.meta}</span>
            </p>
          </div>
        </Card>
      )}
      {choice === 'volontaire' && <ParcoursVolontaire key="volontaire" />}
      {choice === 'unite' && <ParcoursUnite key="unite" />}
      {choice && (
        <HelpText>
          Tout commence sur la <Link to="/connexion">page de connexion</Link> — le lien reçu par
          e-mail crée le compte.
        </HelpText>
      )}
    </div>
  )
}

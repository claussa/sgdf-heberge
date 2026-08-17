import { eventConfig } from '@repo/event-config'
import { PageTitle, SectionTitle } from '../ui'

const { legal } = eventConfig

/**
 * Mentions légales + information RGPD (art. 12-14) sur une seule page — pas de
 * politique de confidentialité séparée pour un run de 2 mois. Textes issus de la
 * « Proposition mentions légales » de la coordination ; tout ce qui est propre à
 * l'événement vient de eventConfig.legal.
 */
export function MentionsLegales() {
  return (
    <div className="legal fade">
      <PageTitle>Mentions légales,</PageTitle>

      <section>
        <SectionTitle>Éditeur du site,</SectionTitle>
        <p>
          Le site <strong>{eventConfig.appName}</strong> — plateforme d'hébergement des volontaires
          et participants pour l'événement « {eventConfig.name} » — {legal.editorIntro}
        </p>
        {legal.editorParagraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <p>
          Contacts :{' '}
          {legal.contactEmails.map((email, i) => (
            <span key={email}>
              {i > 0 && ' — '}
              <a href={`mailto:${email}`}>{email}</a>
            </span>
          ))}
        </p>
      </section>

      <section>
        <SectionTitle>Hébergement,</SectionTitle>
        <p>
          Le site et sa base de données sont hébergés par <strong>Scaleway SAS</strong>, 8 rue de la
          Ville l'Évêque, 75008 Paris, France, dans des centres de données situés en France (région
          Paris).
        </p>
        <p>
          Les emails du service (lien de connexion, notifications) sont envoyés via{' '}
          <strong>Resend</strong>, depuis des serveurs situés en Irlande (Union européenne, région
          eu-west-1).
        </p>
      </section>

      <section>
        <SectionTitle>Données personnelles,</SectionTitle>
        <p>
          Les données sont collectées pour le seul fonctionnement de la plateforme : création du
          compte et connexion par lien email, mise en relation entre volontaires, participants et
          hébergeurs, jumelage entre unités, et suivi de l'événement par les organisateurs.
        </p>
        <p>
          Données traitées : nom et prénom, adresse email, numéro de téléphone, adresse des
          logements proposés, messages échangés, et — uniquement si vous les renseignez — vos
          besoins d'accessibilité. Ce traitement repose sur l'exécution du service que vous demandez
          en créant votre compte ; les besoins d'accessibilité sont renseignés volontairement et
          reposent sur votre consentement explicite.
        </p>
        <p>
          Les données sensibles (téléphone, adresses des logements, besoins d'accessibilité,
          messages) sont chiffrées en base de données. L'adresse complète d'un logement n'est
          communiquée au demandeur qu'après acceptation par l'hébergeur.
        </p>
        <p>
          Destinataires : les données ne sont ni cédées ni vendues. Elles sont traitées par nos
          sous-traitants techniques — Scaleway (hébergement, France), Resend (envoi d'emails,
          Irlande) et PostHog (mesure d'audience et suivi des erreurs, données hébergées en Union
          européenne) — et ne sont visibles des autres utilisateurs que dans la stricte mesure du
          service (une demande transmet vos coordonnées à l'hébergeur concerné).
        </p>
        <p>
          Mesure d'audience et suivi des erreurs : nous utilisons PostHog (hébergement des données
          en Union européenne) pour compter les pages consultées, mesurer l'usage des
          fonctionnalités et détecter les erreurs techniques. Ces mesures sont rattachées à un
          identifiant interne, jamais à votre email ; aucune donnée saisie dans les formulaires,
          aucun message et aucune adresse ne sont transmis à cet outil. Pas d'enregistrement de
          session ni de publicité.
        </p>
        <p>
          Durées de conservation : les demandes sans réponse expirent au bout de 7 jours ; les
          comptes jamais activés sont supprimés après 7 jours ; l'ensemble des données de la
          plateforme est définitivement supprimé au plus tard {legal.dataDeletionDeadline}.
        </p>
        <p>
          Vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité,
          d'opposition et de limitation. Vous pouvez à tout moment exporter vos données ou supprimer
          votre compte depuis votre page de profil, ou contacter :{' '}
          <a href={`mailto:${legal.privacyContactEmail}`}>{legal.privacyContactEmail}</a>. Vous
          pouvez également introduire une réclamation auprès de la CNIL (www.cnil.fr).
        </p>
      </section>

      <section>
        <SectionTitle>Cookies,</SectionTitle>
        <p>
          Le site n'utilise qu'un seul cookie : un cookie de session strictement nécessaire à la
          connexion, inaccessible aux scripts. La mesure d'audience (voir ci-dessus) fonctionne sans
          rien déposer dans votre navigateur : ni cookie, ni stockage local. Aucun cookie
          publicitaire ou traceur tiers n'est déposé — c'est pourquoi aucun bandeau de consentement
          n'est affiché.
        </p>
      </section>

      <section>
        <SectionTitle>Propriété intellectuelle,</SectionTitle>
        <p>
          L'ensemble du site (structure, textes, illustrations, logos) est protégé par le droit de
          la propriété intellectuelle. Les marques et logos {eventConfig.organizer} sont la
          propriété de l'association. Toute reproduction sans autorisation préalable est interdite.
        </p>
      </section>
    </div>
  )
}

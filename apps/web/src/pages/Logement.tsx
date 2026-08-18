import { ACCESS_CRITERIA, type ListingDetail, type Me } from '@repo/contracts'
import { eventConfig, formatDateRangeLong } from '@repo/event-config'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { ACCESS_CRITERIA_LABELS } from '../lib/access-criteria'
import { api } from '../lib/api'
import { useMe } from '../lib/hooks'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  HelpText,
  Input,
  Loading,
  PARKING_EASE_LABELS,
  PageTitle,
  ParkingGauge,
  SectionTitle,
  SigneImage,
  SuccessPanel,
  Textarea,
} from '../ui'
import { prenomDe, signeDe } from './volontaire-lib'
import './volontaire.css'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Prefill reporté par la recherche (?from&to&people), sinon défauts de l’événement. */
function dateParam(parametres: URLSearchParams, cle: string, defaut: string): string {
  const valeur = parametres.get(cle)
  return valeur !== null && ISO_DATE.test(valeur) ? valeur : defaut
}

function personnesParam(parametres: URLSearchParams, defaut: number): number {
  const valeur = Number(parametres.get('people'))
  return Number.isInteger(valeur) && valeur >= 1 && valeur <= 30 ? valeur : defaut
}

/** /logements/:id — écran A.5 fiche logement. */
export function Logement() {
  const { id = '' } = useParams()
  // La query string porte les filtres de la recherche : le retour les réapplique.
  const { search } = useLocation()
  const { me, isPending } = useMe()

  const fiche = useQuery({
    queryKey: ['listing', id],
    enabled: id !== '',
    queryFn: async () => {
      const res = await api.listings[':id'].$get({ param: { id } })
      if (res.status === 200) return res.json()
      if (res.status === 404) return null
      throw new Error(`GET /listings/${id} : ${res.status}`)
    },
  })

  if (isPending || (id !== '' && fiche.isPending)) return <Loading />
  if (!me) return null
  if (id !== '' && fiche.data) return <FicheLogement logement={fiche.data} me={me} />

  return (
    <div className="fiche-logement fade">
      <Link to={`/recherche${search}`} className="fiche-logement__retour">
        ← Retour à la recherche
      </Link>
      {fiche.isError ? (
        <p className="alert-text">Le chargement a échoué. Réessaie dans un instant.</p>
      ) : (
        <EmptyState>Logement introuvable.</EmptyState>
      )}
    </div>
  )
}

function FicheLogement({ logement, me }: { logement: ListingDetail; me: Me }) {
  const [parametres] = useSearchParams()
  const retourRecherche =
    parametres.toString() === '' ? '/recherche' : `/recherche?${parametres.toString()}`
  const prenom = prenomDe(logement.hostDisplayName)
  const criteres = ACCESS_CRITERIA.filter((slug) => logement.access[slug])

  const sousTitre = [
    `${logement.displayArea} — quartier seulement`,
    `disponible ${formatDateRangeLong(logement.availableFrom, logement.availableTo)}`,
    ...(logement.hostDisplayName === null ? [] : [`chez ${logement.hostDisplayName}`]),
  ].join(' · ')

  const prefill = {
    dateFrom: dateParam(parametres, 'from', eventConfig.dates.start),
    dateTo: dateParam(parametres, 'to', eventConfig.dates.end),
    personnes: personnesParam(parametres, me.groupSize ?? 1),
  }

  return (
    <div className="fiche-logement fade">
      <Link to={retourRecherche} className="fiche-logement__retour">
        ← Retour à la recherche
      </Link>
      <div className="fiche-logement__grille">
        <div className="fiche-logement__colonne">
          <div className="fiche-logement__media">
            <SigneImage name={signeDe(logement)} size={64} opacity={0.45} />
          </div>
          <PageTitle>{logement.title},</PageTitle>
          <p className="fiche-logement__soustitre">{sousTitre}</p>
          {criteres.length > 0 && (
            <div className="fiche-logement__badges">
              {criteres.map((slug) => (
                <Badge key={slug}>{ACCESS_CRITERIA_LABELS[slug].label}</Badge>
              ))}
            </div>
          )}
          {logement.parkingEase && (
            <p className="fiche-logement__parking text-body">
              <ParkingGauge ease={logement.parkingEase} />
              Stationnement à proximité : {PARKING_EASE_LABELS[logement.parkingEase].toLowerCase()}
            </p>
          )}
          {logement.description && (
            <p className="fiche-logement__description">{logement.description}</p>
          )}
        </div>
        <div className="fiche-logement__colonne">
          {logement.category === 'HOTEL' ||
          (logement.category === 'SCOUT_BASE' && logement.bookingUrl !== null) ? (
            <PanneauReservationExterne logement={logement} />
          ) : (
            <PanneauDemande logement={logement} prenom={prenom} prefill={prefill} />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Hôtel, ou base scoute avec lien : pas de demande — prix en gros et réservation
 * directe (variante v1 actée).
 */
function PanneauReservationExterne({ logement }: { logement: ListingDetail }) {
  const estHotel = logement.category === 'HOTEL'
  // Compteur agrégé pour l'admin — fire-and-forget : la navigation part en
  // target="_blank", on ne la bloque jamais sur le tracking (échec silencieux).
  const compterClic = () => {
    api.listings[':id']['booking-click'].$post({ param: { id: logement.id } }).catch(() => {})
  }
  return (
    <Card accentTop="brand" className="fiche-logement__panneau">
      <div className="fiche-logement__form">
        {logement.priceInfo && <p className="fiche-logement__prix">{logement.priceInfo}</p>}
        <p className="text-body">
          La réservation se fait directement sur{' '}
          {estHotel ? 'la plateforme de l’hôtel' : 'la plateforme de réservation de la base'}.
        </p>
        {logement.bookingUrl && (
          <a
            className="btn btn--primary"
            href={logement.bookingUrl}
            target="_blank"
            rel="noreferrer"
            onClick={compterClic}
          >
            {estHotel ? 'Réserver sur le site de l’hôtel' : 'Réserver sur le site de la base'}
          </a>
        )}
      </div>
    </Card>
  )
}

/**
 * Panneau « Ma demande, » (PRIVATE, COLLECTIVE et SCOUT_BASE sans lien — les
 * institutionnels affichent aussi leur prix).
 */
function PanneauDemande({
  logement,
  prenom,
  prefill,
}: {
  logement: ListingDetail
  prenom: string | null
  prefill: { dateFrom: string; dateTo: string; personnes: number }
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [dateFrom, setDateFrom] = useState(prefill.dateFrom)
  const [dateTo, setDateTo] = useState(prefill.dateTo)
  const [personnes, setPersonnes] = useState(String(prefill.personnes))
  const [message, setMessage] = useState('')

  const nbPersonnes = Number(personnes)
  const personnesValide = Number.isInteger(nbPersonnes) && nbPersonnes >= 1

  const envoi = useMutation({
    mutationFn: async () => {
      const res = await api.listings[':id'].requests.$post({
        param: { id: logement.id },
        json: { dateFrom, dateTo, peopleCount: nbPersonnes, message: message.trim() },
      })
      if (res.status === 201) return
      if (res.status === 409) {
        const corps = await res.json()
        throw new Error(corps.error.message)
      }
      throw new Error('L’envoi a échoué. Attends un instant, puis réessaie.')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-requests'] })
    },
  })

  // « L’hébergeur » en tête de phrase, « l’hébergeur » au fil du texte (institutionnels)
  const prenomPhrase = prenom ?? 'L’hébergeur'
  const prenomTexte = prenom ?? 'l’hébergeur'

  if (envoi.isSuccess) {
    return (
      <SuccessPanel>
        <p className="text-body">
          <b>Demande envoyée !</b> {prenomPhrase} a 7 jours pour répondre. Tu seras prévenue par
          e-mail.
        </p>
        <Button
          variant="secondary"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => navigate('/mes-demandes')}
        >
          Suivre mes demandes
        </Button>
      </SuccessPanel>
    )
  }

  const surCapacite = personnesValide && nbPersonnes > logement.capacity
  const placesTexte = `${logement.capacity} place${logement.capacity > 1 ? 's' : ''}`

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!envoi.isPending && personnesValide && message.trim() !== '') envoi.mutate()
  }

  return (
    <Card accentTop="brand" className="fiche-logement__panneau">
      <form className="fiche-logement__form" onSubmit={onSubmit}>
        <SectionTitle>Ma demande,</SectionTitle>
        {logement.category !== 'PRIVATE' && logement.priceInfo && (
          <p className="fiche-logement__prix">{logement.priceInfo}</p>
        )}
        <Field label="Dates et personnes">
          <span className="field__pair">
            <Input
              type="date"
              min={eventConfig.dates.inputMin}
              max={eventConfig.dates.inputMax}
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              aria-label="Arrivée"
              required
            />
            <Input
              type="date"
              min={eventConfig.dates.inputMin}
              max={eventConfig.dates.inputMax}
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              aria-label="Départ"
              required
            />
          </span>
          <span className="fiche-logement__personnes">
            <Input
              type="number"
              min={1}
              max={30}
              value={personnes}
              onChange={(event) => setPersonnes(event.target.value)}
              aria-label="Nombre de personnes"
              required
            />
            <span className="text-body">personnes</span>
          </span>
        </Field>
        {surCapacite && (
          <p className="alert-text">
            Attention : vous êtes {nbPersonnes} pour {placesTexte}. {prenomPhrase} pourra accepter
            ou refuser.
          </p>
        )}
        <Field label={`Un message pour ${prenomTexte}`}>
          <Textarea
            uiSize="lg"
            placeholder="Qui vous êtes, sur quel service vous êtes volontaires…"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
          />
        </Field>
        {envoi.isError && <p className="alert-text">{envoi.error.message}</p>}
        <Button type="submit" disabled={envoi.isPending} style={{ alignSelf: 'flex-start' }}>
          Envoyer ma demande
        </Button>
        <HelpText>
          Ton numéro est transmis avec la demande. Tu ne peux pas écrire à {prenomTexte} en dehors
          de cette demande : c’est {prenomTexte} qui te contacte.
        </HelpText>
      </form>
    </Card>
  )
}

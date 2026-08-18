import {
  ACCESS_CRITERIA,
  INPUT_LIMITS,
  type ListingCard,
  ListingSearchQuerySchema,
  type Me,
  PARKING_EASE,
  type ParkingEase,
  type SearchType,
} from '@repo/contracts'
import { eventConfig, type SiteSlug } from '@repo/event-config'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { ACCESS_CRITERIA_LABELS } from '../lib/access-criteria'
import { api } from '../lib/api'
import { useMe } from '../lib/hooks'
import {
  Badge,
  Chip,
  HelpText,
  Input,
  Loading,
  PARKING_EASE_LABELS,
  PageTitle,
  ParkingGauge,
  SigneImage,
} from '../ui'
import { signeDe } from './volontaire-lib'
import { useVolontaireTourProposal } from './volontaire-tour'
import './volontaire.css'

/** Chips « Type » (A.4) — libellé maquette → valeur de filtre API, en OR. */
const CHIPS_TYPE: ReadonlyArray<{ label: string; value: SearchType }> = [
  { label: 'Canapé', value: 'COUCH' },
  { label: 'Couchage sommaire', value: 'FLOOR_BED' },
  { label: 'Chambre privée', value: 'PRIVATE_ROOM' },
  { label: 'Tente', value: 'TENT_SPOT' },
  { label: 'Hôtel', value: 'HOTEL' },
  { label: 'Gymnase', value: 'COLLECTIVE' },
  { label: 'Base scoute', value: 'SCOUT_BASE' },
]

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const TYPES_VALIDES = new Set<string>(CHIPS_TYPE.map((chip) => chip.value))

/** Une date depuis l'URL : '' (champ vidé) et ISO acceptés, sinon défaut événement. */
function dateParam(parametres: URLSearchParams, cle: string, defaut: string): string {
  const valeur = parametres.get(cle)
  return valeur !== null && (valeur === '' || ISO_DATE.test(valeur)) ? valeur : defaut
}

/** Badges d'accessibilité affichés sur une carte privée avant le « … » de débordement. */
const MAX_BADGES_PRIVES = 2

/**
 * Badges de la carte. Institutionnels : catégorie puis « Payant » (checkbox admin)
 * visibles, tous les critères d'accessibilité derrière le « … » (bulle au survol).
 * Privés : les 2 premiers critères visibles, le reste derrière le « … ».
 */
function badgesDe(carte: ListingCard): { visibles: string[]; masques: string[] } {
  const criteres = ACCESS_CRITERIA.filter((slug) => carte.access[slug]).map(
    (slug) => ACCESS_CRITERIA_LABELS[slug].label,
  )
  const badges: string[] = []
  if (carte.category === 'HOTEL') badges.push('Hôtel')
  if (carte.category === 'COLLECTIVE') badges.push('Couchage collectif')
  if (carte.category === 'SCOUT_BASE') badges.push('Base scoute')
  if (carte.isPaid) badges.push(carte.priceInfo ? `Payant · ${carte.priceInfo}` : 'Payant')
  if (badges.length > 0) return { visibles: badges, masques: criteres }
  return {
    visibles: criteres.slice(0, MAX_BADGES_PRIVES),
    masques: criteres.slice(MAX_BADGES_PRIVES),
  }
}

/** /recherche — écran A.4 « Où dormiras-tu ? ». */
export function Recherche() {
  const { me, isPending } = useMe()
  if (isPending) return <Loading />
  if (!me) return null
  return <RechercheView me={me} />
}

function RechercheView({ me }: { me: Me }) {
  // Tour guidé volontaire : proposé une seule fois, à la première visite de la recherche.
  useVolontaireTourProposal()
  // L'URL est la source de vérité des filtres : le retour depuis une fiche les réapplique.
  const [parametres, setParametres] = useSearchParams()
  const defauts = {
    site: eventConfig.sites[0].slug,
    from: eventConfig.dates.start,
    to: eventConfig.dates.end,
    people: String(me.groupSize ?? 1),
  }

  const siteBrut = parametres.get('site')
  const site: SiteSlug = eventConfig.sites.find((s) => s.slug === siteBrut)?.slug ?? defauts.site
  const dateFrom = dateParam(parametres, 'from', defauts.from)
  const dateTo = dateParam(parametres, 'to', defauts.to)
  const personnes = parametres.get('people') ?? defauts.people
  const types = parametres.getAll('types').filter((t): t is SearchType => TYPES_VALIDES.has(t))
  const besoins = parametres.get('besoins') === '1'
  /** Facilité de stationnement minimale exigée (null = pas de filtre) */
  const parkingBrut = parametres.get('parking')
  const parking: ParkingEase | null = PARKING_EASE.find((ease) => ease === parkingBrut) ?? null

  const majFiltres = (
    patch: Partial<{
      site: SiteSlug
      from: string
      to: string
      people: string
      types: SearchType[]
      besoins: boolean
      parking: ParkingEase | null
    }>,
  ) => {
    const etat = {
      site,
      from: dateFrom,
      to: dateTo,
      people: personnes,
      types,
      besoins,
      parking,
      ...patch,
    }
    const suivant = new URLSearchParams()
    if (etat.site !== defauts.site) suivant.set('site', etat.site)
    if (etat.from !== defauts.from) suivant.set('from', etat.from)
    if (etat.to !== defauts.to) suivant.set('to', etat.to)
    if (etat.people !== defauts.people) suivant.set('people', etat.people)
    for (const t of etat.types) suivant.append('types', t)
    if (etat.besoins) suivant.set('besoins', '1')
    if (etat.parking !== null) suivant.set('parking', etat.parking)
    setParametres(suivant, { replace: true })
  }

  // Validée ici et non dans `majFiltres` : une URL partagée ne passe pas par le formulaire.
  const query = {
    site,
    from: dateFrom || undefined,
    to: dateTo || undefined,
    people: personnes.trim() === '' ? undefined : personnes,
    types: types.length > 0 ? types : undefined,
    access: besoins && me.accessibilityNeeds.length > 0 ? me.accessibilityNeeds : undefined,
    parking: parking ?? undefined,
    pageSize: '60',
  }
  const filtres = ListingSearchQuerySchema.safeParse(query)
  const erreurFiltres = filtres.success
    ? null
    : filtres.error.issues.some((issue) => issue.path[0] === 'people')
      ? `Indique un nombre entier de personnes, entre ${INPUT_LIMITS.people.min} et ${INPUT_LIMITS.people.max}.`
      : 'Ces filtres ne sont pas valides.'

  const recherche = useQuery({
    queryKey: ['listings', query],
    enabled: filtres.success,
    queryFn: async () => {
      const res = await api.listings.$get({ query })
      if (res.status !== 200) throw new Error(`GET /listings : ${res.status}`)
      return res.json()
    },
    placeholderData: (precedent) => precedent,
  })

  const basculeType = (valeur: SearchType) => {
    majFiltres({
      types: types.includes(valeur) ? types.filter((t) => t !== valeur) : [...types, valeur],
    })
  }

  // Toute la recherche est reportée sur la fiche : prefill de la demande (from/to/people)
  // et retour à la recherche avec les mêmes filtres.
  const lienSuffixe = parametres.toString() === '' ? '' : `?${parametres.toString()}`

  const resultats = recherche.data

  return (
    <div className="recherche fade">
      <PageTitle>Où dormiras-tu ?</PageTitle>
      <div className="recherche__filtres">
        <div className="recherche__filtres-ligne">
          <span className="field__label recherche__filtres-libelle">Site</span>
          <span className="recherche__chips">
            {eventConfig.sites.map((s) => (
              <Chip
                key={s.slug}
                active={site === s.slug}
                onClick={() => majFiltres({ site: s.slug })}
              >
                {s.label}
              </Chip>
            ))}
          </span>
          <span className="recherche__criteres">
            <Input
              type="date"
              uiSize="xs"
              className="recherche__date"
              min={eventConfig.dates.inputMin}
              max={eventConfig.dates.inputMax}
              value={dateFrom}
              onChange={(event) => majFiltres({ from: event.target.value })}
              aria-label="Arrivée"
            />
            <Input
              type="date"
              uiSize="xs"
              className="recherche__date"
              min={eventConfig.dates.inputMin}
              max={eventConfig.dates.inputMax}
              value={dateTo}
              onChange={(event) => majFiltres({ to: event.target.value })}
              aria-label="Départ"
            />
            <Input
              type="number"
              uiSize="xs"
              className="recherche__nombre"
              min={INPUT_LIMITS.people.min}
              max={INPUT_LIMITS.people.max}
              value={personnes}
              onChange={(event) => majFiltres({ people: event.target.value })}
              aria-label="Nombre de personnes"
            />
            <span className="recherche__suffixe">personnes</span>
          </span>
        </div>
        <div className="recherche__filtres-ligne">
          <span className="field__label recherche__filtres-libelle">Type</span>
          <span className="recherche__chips" data-tour="filtres-type">
            {CHIPS_TYPE.map((chip) => (
              <Chip
                key={chip.value}
                active={types.includes(chip.value)}
                onClick={() => basculeType(chip.value)}
              >
                {chip.label}
              </Chip>
            ))}
            {me.accessibilityNeeds.length > 0 && (
              <Chip
                active={besoins}
                onClick={() => majFiltres({ besoins: !besoins })}
                data-tour="filtre-besoins"
              >
                Compatibles avec mes besoins
              </Chip>
            )}
          </span>
        </div>
        <div className="recherche__filtres-ligne">
          <span className="field__label recherche__filtres-libelle">Parking</span>
          <span className="recherche__chips">
            {PARKING_EASE.map((ease) => (
              <Chip
                key={ease}
                active={parking === ease}
                onClick={() => majFiltres({ parking: parking === ease ? null : ease })}
              >
                <ParkingGauge ease={ease} className="recherche__chip-jauge" />
                {PARKING_EASE_LABELS[ease]}
                {ease !== 'EASY' ? ' ou mieux' : ''}
              </Chip>
            ))}
          </span>
        </div>
      </div>
      {erreurFiltres ? (
        <p className="alert-text">{erreurFiltres}</p>
      ) : recherche.isError ? (
        <p className="alert-text">La recherche a échoué. Réessaie dans un instant.</p>
      ) : resultats === undefined ? (
        <Loading />
      ) : (
        <>
          <div className="recherche__resultats-entete">
            <p className="recherche__compte" data-tour="resultats">
              <b>{resultats.total}</b> logement{resultats.total > 1 ? 's' : ''}
            </p>
            {resultats.total > 0 && (
              <p className="recherche__nouvelles-offres">
                <SigneImage name="etoile" size={16} />
                <span className="recherche__nouvelles-offres-texte">
                  Des particuliers ajoutent régulièrement des logements, et nous avons des pistes
                  d’hébergements collectifs complémentaires. Repasse de temps en temps si aucune
                  offre ne correspond à tes besoins !
                </span>
              </p>
            )}
          </div>
          {resultats.total === 0 ? (
            <div className="recherche__fin-de-piste">
              <SigneImage name="fin-de-piste" size={44} />
              <p className="recherche__fin-de-piste-titre">Fin de piste… pour aujourd’hui,</p>
              <p className="recherche__fin-de-piste-texte">
                Aucune offre ne correspond à tes filtres pour l’instant. Des particuliers ajoutent
                régulièrement des logements, et des hébergements collectifs complémentaires sont en
                préparation : repasse dans quelques jours, ou essaye d’élargir tes critères si tu le
                peux.
              </p>
            </div>
          ) : (
            <div className="recherche__grille">
              {resultats.items.map((carte) => (
                <CarteLogement key={carte.id} carte={carte} lienSuffixe={lienSuffixe} />
              ))}
            </div>
          )}
        </>
      )}
      <HelpText>
        Seul le quartier de chaque logement est affiché. L’adresse complète t’est transmise quand
        l’hébergeur accepte ta demande.
      </HelpText>
    </div>
  )
}

/** Carte logement (structure C.2) — clic = fiche, filtres reportés dans l’URL. */
function CarteLogement({ carte, lienSuffixe }: { carte: ListingCard; lienSuffixe: string }) {
  const { visibles, masques } = badgesDe(carte)
  return (
    <Link to={`/logements/${carte.id}${lienSuffixe}`} className="carte-logement">
      <span className="carte-logement__media">
        <SigneImage name={signeDe(carte)} size={44} opacity={0.45} />
      </span>
      <span className="carte-logement__corps">
        <span className="carte-logement__titre">{carte.title}</span>
        <span className="carte-logement__zone">{carte.displayArea}</span>
        {carte.parkingEase && (
          <span className="carte-logement__parking">
            <ParkingGauge ease={carte.parkingEase} />
            Stationnement {PARKING_EASE_LABELS[carte.parkingEase].toLowerCase()}
          </span>
        )}
        {visibles.length > 0 && (
          <span className="carte-logement__badges">
            {visibles.map((badge) => (
              <Badge key={badge}>{badge}</Badge>
            ))}
            {masques.length > 0 && (
              <span className="carte-logement__badge-plus">
                <span aria-hidden="true">
                  <Badge>…</Badge>
                </span>
                {/* Lecteurs d'écran : la bulle est en display:none, le texte passe par ici. */}
                <span className="sr-only">{masques.join(', ')}</span>
                <span className="carte-logement__badge-bulle" aria-hidden="true">
                  {masques.map((badge) => (
                    <Badge key={badge}>{badge}</Badge>
                  ))}
                </span>
              </span>
            )}
          </span>
        )}
      </span>
    </Link>
  )
}

import { ACCESS_CRITERIA, type ListingCard, type Me, type SearchType } from '@repo/contracts'
import { eventConfig, type SiteSlug } from '@repo/event-config'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { ACCESS_CRITERIA_LABELS } from '../lib/access-criteria'
import { api } from '../lib/api'
import { useMe } from '../lib/hooks'
import { Badge, Chip, EmptyState, HelpText, Input, Loading, PageTitle, SigneImage } from '../ui'
import { signeDe } from './benevole-lib'
import './benevole.css'

/** Réponse de GET /listings (miroir de ListingSearchResponseSchema, cf. contrats). */
type ListingSearchResponse = {
  items: ListingCard[]
  total: number
  page: number
  pageSize: number
}

/** Chips « Type » (A.4) — libellé maquette → valeur de filtre API, en OR. */
const CHIPS_TYPE: ReadonlyArray<{ label: string; value: SearchType }> = [
  { label: 'Canapé', value: 'COUCH' },
  { label: 'Couchage sommaire', value: 'FLOOR_BED' },
  { label: 'Chambre privée', value: 'PRIVATE_ROOM' },
  { label: 'Tente', value: 'TENT_SPOT' },
  { label: 'Hôtel', value: 'HOTEL' },
  { label: 'Gymnase', value: 'COLLECTIVE' },
]

/** Badge unique de la carte : payant (hôtel), collectif (gymnase), sinon 1er critère vrai. */
function badgeDe(carte: ListingCard): string | null {
  if (carte.category === 'HOTEL') return carte.priceInfo ? `Payant · ${carte.priceInfo}` : 'Payant'
  if (carte.category === 'COLLECTIVE') return 'Couchage collectif'
  const critere = ACCESS_CRITERIA.find((slug) => carte.access[slug])
  return critere ? ACCESS_CRITERIA_LABELS[critere].label : null
}

/** /recherche — écran A.4 « Où dormiras-tu ? ». */
export function Recherche() {
  const { me, isPending } = useMe()
  if (isPending) return <Loading />
  if (!me) return null
  return <RechercheView me={me} />
}

function RechercheView({ me }: { me: Me }) {
  const [site, setSite] = useState<SiteSlug>(eventConfig.sites[0].slug)
  const [dateFrom, setDateFrom] = useState<string>(eventConfig.dates.start)
  const [dateTo, setDateTo] = useState<string>(eventConfig.dates.end)
  const [personnes, setPersonnes] = useState(String(me.groupSize ?? 1))
  const [types, setTypes] = useState<SearchType[]>([])
  const [besoins, setBesoins] = useState(false)

  const nbPersonnes = Number(personnes)
  const personnesValide = Number.isInteger(nbPersonnes) && nbPersonnes >= 1

  const recherche = useQuery({
    queryKey: [
      'listings',
      site,
      dateFrom,
      dateTo,
      personnes,
      [...types].sort().join('+'),
      besoins ? me.accessibilityNeeds.join('+') : '',
    ],
    // Annotation explicite (même motif que fetchMe dans lib/hooks.ts) : le json()
    // du RPC ressort en any — on fixe le type au contrat.
    queryFn: async (): Promise<ListingSearchResponse> => {
      const res = await api.listings.$get({
        query: {
          site,
          from: dateFrom || undefined,
          to: dateTo || undefined,
          people: personnesValide ? personnes : undefined,
          types: types.length > 0 ? types : undefined,
          access: besoins && me.accessibilityNeeds.length > 0 ? me.accessibilityNeeds : undefined,
          pageSize: '60',
        },
      })
      if (res.status !== 200) throw new Error(`GET /listings : ${res.status}`)
      return res.json()
    },
    placeholderData: (precedent) => precedent,
  })

  const basculeType = (valeur: SearchType) => {
    setTypes((actifs) =>
      actifs.includes(valeur) ? actifs.filter((t) => t !== valeur) : [...actifs, valeur],
    )
  }

  // Les filtres dates/personnes sont reportés sur la fiche (prefill de la demande)
  const parametres = new URLSearchParams()
  if (dateFrom) parametres.set('from', dateFrom)
  if (dateTo) parametres.set('to', dateTo)
  if (personnesValide) parametres.set('people', personnes)
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
              <Chip key={s.slug} active={site === s.slug} onClick={() => setSite(s.slug)}>
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
              onChange={(event) => setDateFrom(event.target.value)}
              aria-label="Arrivée"
            />
            <Input
              type="date"
              uiSize="xs"
              className="recherche__date"
              min={eventConfig.dates.inputMin}
              max={eventConfig.dates.inputMax}
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              aria-label="Départ"
            />
            <Input
              type="number"
              uiSize="xs"
              className="recherche__nombre"
              min={1}
              max={30}
              value={personnes}
              onChange={(event) => setPersonnes(event.target.value)}
              aria-label="Nombre de personnes"
            />
            <span className="recherche__suffixe">personnes</span>
          </span>
        </div>
        <div className="recherche__filtres-ligne">
          <span className="field__label recherche__filtres-libelle">Type</span>
          <span className="recherche__chips">
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
              <Chip active={besoins} onClick={() => setBesoins((actif) => !actif)}>
                Compatibles avec mes besoins
              </Chip>
            )}
          </span>
        </div>
      </div>
      {recherche.isError ? (
        <p className="alert-text">La recherche a échoué. Réessaie dans un instant.</p>
      ) : resultats === undefined ? (
        <Loading />
      ) : (
        <>
          <p className="recherche__compte">
            <b>{resultats.total}</b> logement{resultats.total > 1 ? 's' : ''}
          </p>
          {resultats.total === 0 ? (
            <EmptyState>Aucun logement ne correspond à ta recherche.</EmptyState>
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
  const badge = badgeDe(carte)
  return (
    <Link to={`/logements/${carte.id}${lienSuffixe}`} className="carte-logement">
      <span className="carte-logement__media">
        <SigneImage name={signeDe(carte)} size={44} opacity={0.45} />
      </span>
      <span className="carte-logement__corps">
        <span className="carte-logement__titre">{carte.title}</span>
        <span className="carte-logement__zone">{carte.displayArea}</span>
        {badge && (
          <span className="carte-logement__badges">
            <Badge>{badge}</Badge>
          </span>
        )}
      </span>
    </Link>
  )
}

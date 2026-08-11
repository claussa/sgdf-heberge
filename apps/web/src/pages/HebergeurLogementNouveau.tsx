import type { BedType, MyListing, ParkingEase } from '@repo/contracts'
import { ACCESS_CRITERIA, PARKING_EASE } from '@repo/contracts'
import type { SiteSlug } from '@repo/event-config'
import { eventConfig } from '@repo/event-config'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { ACCESS_CRITERIA_LABELS } from '../lib/access-criteria'
import { api } from '../lib/api'
import {
  AddressAutocomplete,
  type AddressValue,
  Button,
  Checkbox,
  Field,
  FieldGroup,
  HelpText,
  Input,
  Loading,
  PARKING_EASE_LABELS,
  PageTitle,
  ParkingGauge,
  Radio,
  SectionTitle,
  Select,
  Stepper,
  Textarea,
} from '../ui'
import {
  BED_TYPE_LABELS,
  BED_TYPE_ORDER,
  countPersonnes,
  emptyAccessGrid,
  MY_LISTINGS_KEY,
  RECEIVED_REQUESTS_KEY,
  useMyListings,
} from './hebergeur-lib'
import './hebergeur.css'

/**
 * /hebergeur/logements/nouveau et /hebergeur/logements/:id/modifier — écrans
 * A.10/A.11, création en 2 étapes. Le même formulaire sert à l'édition : prefill
 * complet depuis GET /my/listings, adresse pré-affichée via initialQuery (value
 * null = adresse inchangée, le PATCH part alors SANS address).
 */
export function HebergeurLogementNouveau() {
  const { id } = useParams<{ id: string }>()
  const listingsQuery = useMyListings({ enabled: id !== undefined })

  if (id === undefined) return <LogementForm listing={null} />
  if (listingsQuery.isPending) return <Loading />
  if (listingsQuery.isError) {
    return <p className="alert-text">Impossible de charger le logement. Recharge la page.</p>
  }
  const listing = (listingsQuery.data ?? []).find((item) => item.id === id)
  if (!listing) return <Navigate to="/hebergeur/logements" replace />
  return <LogementForm key={id} listing={listing} />
}

type BedRow = {
  key: number
  type: BedType
  count: string
  capacityEach: string
  note: string
}

let bedRowKey = 0

function makeRow(bed?: {
  type: BedType
  count: number
  capacityEach: number
  note: string | null
}): BedRow {
  bedRowKey += 1
  return {
    key: bedRowKey,
    type: bed?.type ?? 'PRIVATE_ROOM',
    count: bed ? String(bed.count) : '1',
    capacityEach: bed ? String(bed.capacityEach) : '1',
    note: bed?.note ?? '',
  }
}

/** Entier ≥ 1 saisi dans une cellule du tableau, sinon 0 (ligne incomplète). */
function rowValue(raw: string): number {
  const value = Number(raw)
  return Number.isInteger(value) && value >= 1 ? value : 0
}

function LogementForm({ listing }: { listing: MyListing | null }) {
  const isEdit = listing !== null
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<1 | 2>(1)
  const [site, setSite] = useState<SiteSlug>(listing?.site ?? eventConfig.sites[0].slug)
  const [availableFrom, setAvailableFrom] = useState(
    listing?.availableFrom ?? eventConfig.dates.start,
  )
  const [availableTo, setAvailableTo] = useState(listing?.availableTo ?? eventConfig.dates.end)
  const [rows, setRows] = useState<BedRow[]>(() =>
    listing && listing.beds.length > 0 ? listing.beds.map((bed) => makeRow(bed)) : [makeRow()],
  )
  const [address, setAddress] = useState<AddressValue | null>(null)
  const [description, setDescription] = useState(listing?.description ?? '')
  const [access, setAccess] = useState(() => (listing ? { ...listing.access } : emptyAccessGrid()))
  const [accessibilityNotes, setAccessibilityNotes] = useState(listing?.accessibilityNotes ?? '')
  const [parkingEase, setParkingEase] = useState<ParkingEase | null>(listing?.parkingEase ?? null)
  const [stepError, setStepError] = useState<string | null>(null)

  const capacity = rows.reduce(
    (sum, row) => sum + rowValue(row.count) * rowValue(row.capacityEach),
    0,
  )

  const updateRow = (key: number, patch: Partial<Omit<BedRow, 'key'>>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        site,
        availableFrom,
        availableTo,
        description: description.trim() === '' ? undefined : description.trim(),
        beds: rows.map((row) => ({
          type: row.type,
          count: Number(row.count),
          capacityEach: Number(row.capacityEach),
          note: row.note.trim() === '' ? undefined : row.note.trim(),
        })),
        access,
        accessibilityNotes:
          accessibilityNotes.trim() === '' ? undefined : accessibilityNotes.trim(),
        parkingEase,
      }
      if (listing) {
        const res = await api.my.listings[':id'].$patch({
          param: { id: listing.id },
          json: address ? { ...body, address } : body,
        })
        if (res.status !== 200) throw new Error(`mise à jour du logement : ${res.status}`)
      } else {
        if (!address) throw new Error('adresse manquante')
        const res = await api.my.listings.$post({ json: { ...body, address } })
        if (res.status !== 201) throw new Error(`création du logement : ${res.status}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_LISTINGS_KEY })
      queryClient.invalidateQueries({ queryKey: RECEIVED_REQUESTS_KEY })
      navigate('/hebergeur/logements')
    },
  })

  const continueToStep2 = () => {
    if (rows.length === 0) {
      setStepError('Ajoute au moins un couchage.')
      return
    }
    if (rows.some((row) => rowValue(row.count) === 0 || rowValue(row.capacityEach) === 0)) {
      setStepError('Complète chaque couchage : combien, et pour combien de personnes.')
      return
    }
    if (availableFrom === '' || availableTo === '' || availableFrom > availableTo) {
      setStepError('Vérifie les dates : le début doit précéder la fin.')
      return
    }
    if (!isEdit && address === null) {
      setStepError('Choisis une adresse dans la liste de suggestions.')
      return
    }
    setStepError(null)
    setStep(2)
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (step === 1) continueToStep2()
    else if (!save.isPending) save.mutate()
  }

  return (
    <form className="logement-form fade" onSubmit={onSubmit}>
      {step === 1 ? (
        <>
          <Stepper step={1} />
          <PageTitle>Décris ton logement,</PageTitle>
          <div className="logement-form__grid3">
            <Field label="Site le plus proche">
              <Select value={site} onChange={(event) => setSite(event.target.value as SiteSlug)}>
                {eventConfig.sites.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Capacité" glose="calculée">
              <Input value={countPersonnes(capacity)} disabled />
            </Field>
            <Field label="Disponible">
              <span className="field__pair">
                <Input
                  type="date"
                  required
                  value={availableFrom}
                  min={eventConfig.dates.inputMin}
                  max={eventConfig.dates.inputMax}
                  aria-label="Du"
                  onChange={(event) => setAvailableFrom(event.target.value)}
                />
                <Input
                  type="date"
                  required
                  value={availableTo}
                  min={eventConfig.dates.inputMin}
                  max={eventConfig.dates.inputMax}
                  aria-label="Au"
                  onChange={(event) => setAvailableTo(event.target.value)}
                />
              </span>
            </Field>
          </div>
          <SectionTitle>Mes couchages,</SectionTitle>
          <div className="couchages">
            <div className="couchages__inner">
              <div className="couchages__head" aria-hidden="true">
                <span>Type</span>
                <span>Combien</span>
                <span>Personnes</span>
                <span>Précision</span>
                <span />
              </div>
              {rows.map((row) => (
                <div key={row.key} className="couchages__row">
                  <Select
                    value={row.type}
                    aria-label="Type"
                    onChange={(event) =>
                      updateRow(row.key, { type: event.target.value as BedType })
                    }
                  >
                    {BED_TYPE_ORDER.map((type) => (
                      <option key={type} value={type}>
                        {BED_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    uiSize="sm"
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={row.count}
                    aria-label="Combien"
                    onChange={(event) => updateRow(row.key, { count: event.target.value })}
                  />
                  <Input
                    uiSize="sm"
                    type="number"
                    min={1}
                    max={20}
                    required
                    value={row.capacityEach}
                    aria-label="Personnes"
                    onChange={(event) => updateRow(row.key, { capacityEach: event.target.value })}
                  />
                  <Input
                    uiSize="sm"
                    type="text"
                    maxLength={200}
                    value={row.note}
                    aria-label="Précision"
                    onChange={(event) => updateRow(row.key, { note: event.target.value })}
                  />
                  <button
                    type="button"
                    className="couchages__remove"
                    onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setRows((current) => [...current, makeRow()])}
          >
            + Ajouter un couchage
          </Button>
          <HelpText>La capacité affichée est la somme des couchages déclarés.</HelpText>
          <AddressAutocomplete
            label="Adresse"
            glose="obligatoire"
            value={address}
            onChange={setAddress}
            initialQuery={listing?.addressFull}
          />
          <HelpText>
            Adresse choisie dans une liste : ville, code postal et distance au site se remplissent
            seuls. Seul le quartier est affiché publiquement — l’adresse complète part au volontaire
            ou participant quand tu acceptes sa demande.
          </HelpText>
          <Field label="Description libre">
            <Textarea
              value={description}
              maxLength={2000}
              placeholder="Horaires d’arrivée, animaux, petit-déjeuner, ce qu’il faut apporter…"
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          {stepError && <p className="alert-text">{stepError}</p>}
          <Button type="submit" style={{ minWidth: 200, alignSelf: 'flex-start' }}>
            Continuer
          </Button>
        </>
      ) : (
        <>
          <button type="button" className="retour-link" onClick={() => setStep(1)}>
            ← Retour à l’étape 1
          </button>
          <Stepper step={2} />
          <PageTitle>Accessibilité de ton logement,</PageTitle>
          <p className="text-body">
            Coche seulement ce qui est vrai chez toi. Ce qui n’entre pas dans une case se dit dans
            le champ libre.
          </p>
          <div className="acces-grid">
            {ACCESS_CRITERIA.map((criterion) => {
              const { label, precision } = ACCESS_CRITERIA_LABELS[criterion]
              return (
                <Checkbox
                  key={criterion}
                  checked={access[criterion]}
                  onChange={() =>
                    setAccess((current) => ({ ...current, [criterion]: !current[criterion] }))
                  }
                  label={
                    precision ? (
                      <>
                        <b>{label}</b> — {precision}
                      </>
                    ) : (
                      <b>{label}</b>
                    )
                  }
                />
              )
            })}
          </div>
          <FieldGroup label="Se garer à proximité">
            <div className="parking-choix">
              <Radio
                name="parkingEase"
                checked={parkingEase === null}
                onChange={() => setParkingEase(null)}
                label="Non renseigné"
              />
              {PARKING_EASE.map((ease) => (
                <Radio
                  key={ease}
                  name="parkingEase"
                  checked={parkingEase === ease}
                  onChange={() => setParkingEase(ease)}
                  label={
                    <span className="parking-choix__option">
                      <ParkingGauge ease={ease} />
                      {PARKING_EASE_LABELS[ease]}
                    </span>
                  }
                />
              ))}
            </div>
            <HelpText>
              Stationnement dans la rue ou parking proche — une indication pour les volontaires et
              participants qui viennent en voiture.
            </HelpText>
          </FieldGroup>
          <Field label="Autres informations d’accessibilité">
            <Textarea
              uiSize="sm"
              maxLength={1000}
              value={accessibilityNotes}
              onChange={(event) => setAccessibilityNotes(event.target.value)}
            />
          </Field>
          {save.isError && (
            <p className="alert-text">
              Impossible d’enregistrer. Vérifie les champs, puis réessaie.
            </p>
          )}
          <Button
            type="submit"
            style={{ minWidth: 220, alignSelf: 'flex-start' }}
            disabled={save.isPending}
          >
            {isEdit ? 'Enregistrer' : 'Publier mon logement'}
          </Button>
          <HelpText>
            Tu pourras ajouter d’autres logements depuis ton compte, et passer chacun en "complet" à
            tout moment.
          </HelpText>
        </>
      )}
    </form>
  )
}

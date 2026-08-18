import {
  ACCESS_CRITERIA,
  type AccessGrid,
  type AdminListing,
  PARKING_EASE,
  type ParkingEase,
} from '@repo/contracts'
import { eventConfig, type SiteSlug, siteLabel } from '@repo/event-config'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { ACCESS_CRITERIA_LABELS } from '../lib/access-criteria'
import { api } from '../lib/api'
import {
  AddressAutocomplete,
  type AddressValue,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
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
  Textarea,
} from '../ui'
import { ADMIN_METRICS_KEY } from './Admin'
import './jumelage-admin.css'

const ADMIN_LISTINGS_KEY = ['admin-listings'] as const

type InstitutionalCategory = 'HOTEL' | 'COLLECTIVE' | 'SCOUT_BASE'

const CATEGORY_LABELS: Record<InstitutionalCategory, string> = {
  HOTEL: 'Hôtel',
  COLLECTIVE: 'Gymnase',
  SCOUT_BASE: 'Base scoute',
}

async function fetchAdminListings() {
  const res = await api.admin.listings.$get()
  if (res.status === 200) return res.json()
  throw new Error(`GET /admin/listings : ${res.status}`)
}

const EMPTY_ACCESS: AccessGrid = {
  pmr: false,
  electricWheelchair: false,
  fewSteps: false,
  humanHelp: false,
  transport: false,
  parking: false,
  assistanceDog: false,
  quiet: false,
}

/**
 * Re-résout le libellé BAN stocké (édition sans changement d'adresse) : le PATCH
 * exige une adresse complète (lat/lng comprises) que la liste admin ne renvoie
 * pas. Le libellé venant de la BAN, la re-résolution est déterministe.
 */
async function resolveStoredAddress(label: string): Promise<AddressValue | null> {
  try {
    const res = await fetch(
      `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(label)}&limit=1`,
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      features?: Array<{
        properties: { label: string; city: string; postcode: string }
        geometry: { coordinates: [number, number] }
      }>
    }
    const feature = data.features?.[0]
    if (!feature) return null
    const [lng, lat] = feature.geometry.coordinates
    return {
      label: feature.properties.label,
      city: feature.properties.city,
      postcode: feature.properties.postcode,
      lat,
      lng,
    }
  } catch {
    return null
  }
}

/**
 * /admin/logements — CRUD des logements institutionnels (hôtels, gymnases, bases scoutes).
 * Hors maquette : liste en cartes-lignes + formulaire unique création/édition.
 */
export function AdminLogements() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<AdminListing | null>(null)
  const [formVersion, setFormVersion] = useState(0)
  const listings = useQuery({ queryKey: ADMIN_LISTINGS_KEY, queryFn: fetchAdminListings })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ADMIN_LISTINGS_KEY })
    queryClient.invalidateQueries({ queryKey: ADMIN_METRICS_KEY })
  }

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.admin.listings[':id'].$delete({ param: { id } })
      if (res.status !== 200) throw new Error(`DELETE /admin/listings : ${res.status}`)
      return id
    },
    onSuccess: (id) => {
      setEditing((current) => (current?.id === id ? null : current))
    },
    onSettled: invalidate,
  })

  const onDelete = (listing: AdminListing) => {
    const confirmed = window.confirm(
      `Supprimer « ${listing.title} » ? Les demandes acceptées seront annulées et les demandeurs prévenus par e-mail.`,
    )
    if (confirmed) remove.mutate(listing.id)
  }

  return (
    <div className="ja-col ja-col--760 fade">
      <Link to="/admin" className="ja-link">
        ← Tableau de bord
      </Link>
      <PageTitle>Logements institutionnels,</PageTitle>
      {listings.isPending && <Loading />}
      {listings.isError && (
        <p className="alert-text">Impossible de charger les logements. Réessaie dans un instant.</p>
      )}
      {listings.data &&
        (listings.data.items.length === 0 ? (
          <EmptyState>Aucun logement institutionnel pour l’instant.</EmptyState>
        ) : (
          listings.data.items.map((listing) => (
            <Card key={listing.id} className="ja-card-stack">
              <div className="ja-row-head">
                <span className="ja-row-title">{listing.title}</span>
                <Badge>
                  {listing.category === 'PRIVATE' ? 'Privé' : CATEGORY_LABELS[listing.category]}
                </Badge>
              </div>
              <p className="ja-card-sub">
                {siteLabel(listing.site)} · {listing.capacity} personnes
                {listing.priceInfo ? ` · ${listing.priceInfo}` : ''}
                {listing.bookingUrl
                  ? ` · ${listing.bookingClicks} clic${listing.bookingClicks > 1 ? 's' : ''} sur le lien de réservation`
                  : ''}
              </p>
              <p className="ja-address">{listing.addressFull}</p>
              <div className="ja-actions">
                <Button size="sm" variant="secondary" onClick={() => setEditing(listing)}>
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onDelete(listing)}
                  disabled={remove.isPending}
                >
                  Supprimer
                </Button>
              </div>
            </Card>
          ))
        ))}
      {remove.isError && (
        <p className="alert-text">La suppression n’a pas abouti. Réessaie dans un instant.</p>
      )}
      <AdminListingForm
        key={editing?.id ?? `new-${formVersion}`}
        listing={editing}
        onSaved={() => {
          invalidate()
          setEditing(null)
          setFormVersion((version) => version + 1)
        }}
        onCancel={() => setEditing(null)}
      />
    </div>
  )
}

type AdminListingFormProps = {
  listing: AdminListing | null
  onSaved: () => void
  onCancel: () => void
}

function AdminListingForm({ listing, onSaved, onCancel }: AdminListingFormProps) {
  const isEdit = listing !== null
  const [category, setCategory] = useState<InstitutionalCategory>(
    listing && listing.category !== 'PRIVATE' ? listing.category : 'HOTEL',
  )
  const [title, setTitle] = useState(listing?.title ?? '')
  const [site, setSite] = useState<SiteSlug>(listing?.site ?? eventConfig.sites[0].slug)
  const [availableFrom, setAvailableFrom] = useState(
    listing?.availableFrom ?? eventConfig.dates.start,
  )
  const [availableTo, setAvailableTo] = useState(listing?.availableTo ?? eventConfig.dates.end)
  const [capacity, setCapacity] = useState(listing ? String(listing.capacity) : '')
  const [priceInfo, setPriceInfo] = useState(listing?.priceInfo ?? '')
  // Badge « Payant » : coché par défaut pour un nouvel hôtel (la catégorie initiale),
  // et suit les changements de catégorie tant que l'admin n'a pas touché la case.
  const [isPaid, setIsPaid] = useState(listing?.isPaid ?? true)
  const [isPaidTouched, setIsPaidTouched] = useState(isEdit)
  const [bookingUrl, setBookingUrl] = useState(listing?.bookingUrl ?? '')
  const [description, setDescription] = useState(listing?.description ?? '')
  const [notes, setNotes] = useState(listing?.accessibilityNotes ?? '')
  const [access, setAccess] = useState<AccessGrid>(listing?.access ?? EMPTY_ACCESS)
  const [parkingEase, setParkingEase] = useState<ParkingEase | null>(listing?.parkingEase ?? null)
  const [address, setAddress] = useState<AddressValue | null>(null)
  // Édition : l'adresse reste verrouillée tant que « Changer l'adresse » n'est
  // pas activé ; l'activer exige une re-sélection dans l'autocomplete BAN.
  const [changeAddress, setChangeAddress] = useState(!isEdit)

  const save = useMutation({
    mutationFn: async () => {
      let finalAddress = address
      if (!finalAddress) {
        if (changeAddress || !listing) throw new Error('ADDRESS_MISSING')
        finalAddress = await resolveStoredAddress(listing.addressFull)
        if (!finalAddress) throw new Error('ADDRESS_RESOLVE')
      }
      const body = {
        category,
        site,
        title: title.trim(),
        description: description.trim() === '' ? null : description.trim(),
        address: finalAddress,
        capacity: Number(capacity),
        priceInfo: priceInfo.trim() === '' ? null : priceInfo.trim(),
        isPaid,
        // Hôtel et base scoute : lien de réservation possible ; gymnase : jamais.
        bookingUrl:
          category !== 'COLLECTIVE' && bookingUrl.trim() !== '' ? bookingUrl.trim() : null,
        availableFrom,
        availableTo,
        access,
        accessibilityNotes: notes.trim() === '' ? null : notes.trim(),
        parkingEase,
      }
      if (listing) {
        const res = await api.admin.listings[':id'].$patch({
          param: { id: listing.id },
          json: body,
        })
        if (res.status !== 200) throw new Error(`PATCH /admin/listings : ${res.status}`)
      } else {
        const res = await api.admin.listings.$post({ json: body })
        if (res.status !== 201) throw new Error(`POST /admin/listings : ${res.status}`)
      }
    },
    onSuccess: onSaved,
    onError: (error) => {
      if (error.message === 'ADDRESS_RESOLVE') setChangeAddress(true)
    },
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!save.isPending) save.mutate()
  }

  const errorText = !save.isError
    ? null
    : save.error.message === 'ADDRESS_MISSING'
      ? 'Choisis l’adresse dans la liste de suggestions.'
      : save.error.message === 'ADDRESS_RESOLVE'
        ? 'L’adresse enregistrée n’a pas pu être vérifiée : choisis-la à nouveau.'
        : 'Impossible d’enregistrer. Vérifie les champs, puis réessaie.'

  return (
    <Card className="ja-card-stack">
      <SectionTitle>{isEdit ? 'Modifier le logement,' : 'Nouveau logement,'}</SectionTitle>
      <form className="ja-col" onSubmit={onSubmit}>
        <div className="ja-grid2">
          <Field label="Catégorie">
            <Select
              value={category}
              onChange={(event) => {
                const next = event.target.value as InstitutionalCategory
                setCategory(next)
                if (!isPaidTouched) setIsPaid(next === 'HOTEL')
              }}
            >
              <option value="HOTEL">Hôtel</option>
              <option value="COLLECTIVE">Gymnase ou collectif</option>
              <option value="SCOUT_BASE">Base scoute</option>
            </Select>
          </Field>
          <Field label="Titre">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
            />
          </Field>
        </div>
        <div className="ja-grid2">
          <Field label="Site">
            <Select value={site} onChange={(event) => setSite(event.target.value as SiteSlug)}>
              {eventConfig.sites.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dates">
            <span className="field__pair">
              <Input
                type="date"
                value={availableFrom}
                onChange={(event) => setAvailableFrom(event.target.value)}
                min={eventConfig.dates.inputMin}
                max={eventConfig.dates.inputMax}
                aria-label="Du"
                required
              />
              <Input
                type="date"
                value={availableTo}
                onChange={(event) => setAvailableTo(event.target.value)}
                min={eventConfig.dates.inputMin}
                max={eventConfig.dates.inputMax}
                aria-label="Au"
                required
              />
            </span>
          </Field>
        </div>
        <div className="ja-grid2">
          <Field label="Capacité">
            <Input
              type="number"
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              min={1}
              max={10000}
              required
            />
          </Field>
          <Field label="Prix / conditions">
            <Input
              value={priceInfo}
              onChange={(event) => setPriceInfo(event.target.value)}
              placeholder="45 € · code PAPE15"
              maxLength={120}
            />
          </Field>
        </div>
        <Checkbox
          checked={isPaid}
          onChange={(event) => {
            setIsPaid(event.target.checked)
            setIsPaidTouched(true)
          }}
          label={
            <>
              <b>Payant</b> — affiche le badge « Payant » sur la carte de recherche, même sans prix
              ni code renseigné
            </>
          }
        />
        {category !== 'COLLECTIVE' && (
          <Field
            label="URL de réservation"
            glose={category === 'SCOUT_BASE' ? 'optionnelle' : undefined}
          >
            <Input
              type="url"
              value={bookingUrl}
              onChange={(event) => setBookingUrl(event.target.value)}
              placeholder="https://…"
              maxLength={500}
            />
            {category === 'SCOUT_BASE' && (
              <HelpText>
                Avec un lien, la réservation se fait en ligne comme pour un hôtel. Sans lien, la
                base reçoit les demandes sur la plateforme, comme un gymnase.
              </HelpText>
            )}
          </Field>
        )}
        {isEdit && !changeAddress && listing ? (
          <div className="ja-address-keep">
            <Field label="Adresse" glose="inchangée">
              <Input value={listing.addressFull} disabled />
            </Field>
            <Button variant="secondary" size="sm" onClick={() => setChangeAddress(true)}>
              Changer l’adresse
            </Button>
          </div>
        ) : (
          <AddressAutocomplete
            label="Adresse"
            glose="obligatoire"
            value={address}
            onChange={setAddress}
          />
        )}
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
          />
        </Field>
        <FieldGroup label="Accessibilité">
          <div className="ja-grid2">
            {ACCESS_CRITERIA.map((slug) => {
              const { label, precision } = ACCESS_CRITERIA_LABELS[slug]
              return (
                <Checkbox
                  key={slug}
                  checked={access[slug]}
                  onChange={(event) => setAccess({ ...access, [slug]: event.target.checked })}
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
        </FieldGroup>
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
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={1000}
          />
        </Field>
        {errorText && <p className="alert-text">{errorText}</p>}
        <div className="ja-actions">
          <Button type="submit" style={{ minWidth: 220 }} disabled={save.isPending}>
            {isEdit ? 'Enregistrer les modifications' : 'Créer le logement'}
          </Button>
          {isEdit && (
            <Button variant="secondary" onClick={onCancel}>
              Annuler
            </Button>
          )}
        </div>
      </form>
    </Card>
  )
}

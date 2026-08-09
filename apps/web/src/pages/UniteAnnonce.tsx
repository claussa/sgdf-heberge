import type { JumelageKind } from '@repo/contracts'
import { eventConfig, type SiteSlug } from '@repo/event-config'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api } from '../lib/api'
import {
  Button,
  Field,
  FieldGroup,
  HelpText,
  Input,
  Loading,
  PageTitle,
  Radio,
  Select,
  Textarea,
} from '../ui'
import { JUMELAGE_ADS_KEY, MY_JUMELAGE_KEY, type MyJumelage, useMyJumelage } from './jumelage-data'
import './jumelage-admin.css'

/**
 * /unite/annonce — écran A.13 « Notre annonce de jumelage, ». Une seule annonce
 * par unité : le PUT crée ou remplace. Le sens (SEEKING/HOSTING) arrive du profil
 * unité en state de navigation, ou de l'annonce existante en édition.
 */
export function UniteAnnonce() {
  const { data, isPending, isError } = useMyJumelage()
  if (isPending) return <Loading />
  if (isError || !data) {
    return (
      <p className="alert-text">Impossible de charger notre annonce. Réessayez dans un instant.</p>
    )
  }
  return <UniteAnnonceForm ad={data.ad} />
}

function UniteAnnonceForm({ ad }: { ad: MyJumelage['ad'] }) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const navState = (location.state ?? null) as { kind?: JumelageKind } | null

  const [kind, setKind] = useState<JumelageKind>(ad?.kind ?? navState?.kind ?? 'SEEKING')
  const [site, setSite] = useState<SiteSlug>(ad?.site ?? eventConfig.sites[0].slug)
  const [dateFrom, setDateFrom] = useState(ad?.dateFrom ?? eventConfig.dates.start)
  const [dateTo, setDateTo] = useState(ad?.dateTo ?? eventConfig.dates.end)
  const [peopleLabel, setPeopleLabel] = useState(ad?.peopleLabel ?? '')
  const [description, setDescription] = useState(ad?.description ?? '')

  // Édition = une annonce en ligne. Une annonce retirée se re-publie (même PUT).
  const isEdition = ad?.status === 'ACTIVE'
  const seeking = kind === 'SEEKING'

  const save = useMutation({
    mutationFn: async () => {
      const res = await api.my.jumelage.ad.$put({
        json: {
          kind,
          site,
          dateFrom,
          dateTo,
          peopleLabel: peopleLabel.trim(),
          description: description.trim() === '' ? null : description.trim(),
        },
      })
      if (res.status !== 200) throw new Error(`PUT /my/jumelage/ad : ${res.status}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_JUMELAGE_KEY })
      queryClient.invalidateQueries({ queryKey: JUMELAGE_ADS_KEY })
      navigate('/jumelage')
    },
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!save.isPending) save.mutate()
  }

  return (
    <form className="ja-col ja-col--560 fade" onSubmit={onSubmit}>
      <PageTitle>{seeking ? 'Notre annonce de jumelage,' : 'Nous pouvons jumeler,'}</PageTitle>
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
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              min={eventConfig.dates.inputMin}
              max={eventConfig.dates.inputMax}
              aria-label="Du"
              required
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              min={eventConfig.dates.inputMin}
              max={eventConfig.dates.inputMax}
              aria-label="Au"
              required
            />
          </span>
        </Field>
      </div>
      <Field label={seeking ? 'Nous serons' : 'Jusqu’à'}>
        <Input
          value={peopleLabel}
          onChange={(event) => setPeopleLabel(event.target.value)}
          placeholder={seeking ? '18 jeunes + 3 chefs' : '30 personnes'}
          maxLength={80}
          required
        />
      </Field>
      <Field label="Un mot sur notre projet">
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Quelques lignes libres : notre service, notre tranche d’âge, ce que nous cherchons…"
          maxLength={1000}
        />
      </Field>
      <FieldGroup label="Notre annonce">
        <Radio
          name="annonce-sens"
          checked={seeking}
          onChange={() => setKind('SEEKING')}
          label={
            <>
              Nous <b>cherchons</b> un jumelage sur place
            </>
          }
        />
        <Radio
          name="annonce-sens"
          checked={!seeking}
          onChange={() => setKind('HOSTING')}
          label={
            <>
              Nous <b>pouvons jumeler</b> une unité qui vient chez nous
            </>
          }
        />
      </FieldGroup>
      {save.isError && (
        <p className="alert-text">
          Impossible d’enregistrer l’annonce. Vérifiez les dates, puis réessayez.
        </p>
      )}
      <Button
        type="submit"
        style={{ minWidth: 220, alignSelf: 'flex-start' }}
        disabled={save.isPending}
      >
        {isEdition ? 'Mettre à jour l’annonce' : 'Publier l’annonce'}
      </Button>
      <HelpText>
        Rien à décrire côté logement : c’est aux deux unités de s’entendre sur le lieu une fois en
        contact — local scout, hébergement chez les familles…
      </HelpText>
    </form>
  )
}

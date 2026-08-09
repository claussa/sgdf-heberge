import type { AccessCriterion, Me } from '@repo/contracts'
import { ACCESS_CRITERIA } from '@repo/contracts'
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { AccountActions } from '../components/AccountActions'
import { ACCESS_CRITERIA_LABELS } from '../lib/access-criteria'
import { api } from '../lib/api'
import { useMe, useSetMe } from '../lib/hooks'
import { Button, Checkbox, Field, FieldGroup, HelpText, Input, Loading, PageTitle } from '../ui'

/**
 * Profil bénévole (A.3). Premier passage (accountType null) : POST /me/onboarding
 * (INDIVIDUAL) ; ensuite : PATCH /me. Puis cap sur la recherche.
 */
export function ProfilBenevole() {
  const { me, isPending } = useMe()
  if (isPending) return <Loading />
  if (!me) return null
  if (me.accountType === 'SCOUT_UNIT') return <Navigate to="/unite" replace />
  return <ProfilBenevoleForm me={me} />
}

function ProfilBenevoleForm({ me }: { me: Me }) {
  const navigate = useNavigate()
  const setMe = useSetMe()
  const [firstName, setFirstName] = useState(me.firstName ?? '')
  const [lastName, setLastName] = useState(me.lastName ?? '')
  const [phone, setPhone] = useState(me.phone ?? '')
  const [groupSize, setGroupSize] = useState(me.groupSize === null ? '' : String(me.groupSize))
  const [needs, setNeeds] = useState<AccessCriterion[]>(me.accessibilityNeeds)

  const save = useMutation({
    mutationFn: async () => {
      const profile = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        groupSize: groupSize === '' ? undefined : Number(groupSize),
        accessibilityNeeds: needs,
      }
      const res =
        me.accountType === null
          ? await api.me.onboarding.$post({ json: { accountType: 'INDIVIDUAL', ...profile } })
          : await api.me.$patch({ json: profile })
      if (res.status !== 200) throw new Error(`enregistrement du profil : ${res.status}`)
      return res.json()
    },
    onSuccess: (fresh) => {
      setMe(fresh)
      navigate('/recherche')
    },
  })

  const toggleNeed = (criterion: AccessCriterion) => {
    setNeeds((current) =>
      current.includes(criterion)
        ? current.filter((item) => item !== criterion)
        : [...current, criterion],
    )
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!save.isPending) save.mutate()
  }

  return (
    <form className="profil fade" onSubmit={onSubmit}>
      <PageTitle>Bénévole individuel,</PageTitle>
      <Field label="E-mail" glose="déjà connu par la connexion">
        <Input value={me.email} disabled />
      </Field>
      <div className="profil__grid">
        <Field label="Prénom et nom">
          <span className="field__pair">
            <Input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              placeholder="Prénom"
              aria-label="Prénom"
              autoComplete="given-name"
              required
            />
            <Input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              placeholder="Nom"
              aria-label="Nom"
              autoComplete="family-name"
              required
            />
          </span>
        </Field>
        <Field label="Nous serons">
          <span className="profil__inline">
            <Input
              type="number"
              min={1}
              max={30}
              value={groupSize}
              onChange={(event) => setGroupSize(event.target.value)}
              aria-label="Nombre de personnes"
            />
            <span className="text-body">personnes</span>
          </span>
        </Field>
      </div>
      <Field label="Téléphone" glose="transmis avec la demande">
        <Input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          autoComplete="tel"
          required
        />
      </Field>
      <FieldGroup label="Mes besoins d’accessibilité">
        {ACCESS_CRITERIA.map((criterion) => {
          const { label, precision } = ACCESS_CRITERIA_LABELS[criterion]
          return (
            <Checkbox
              key={criterion}
              checked={needs.includes(criterion)}
              onChange={() => toggleNeed(criterion)}
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
      </FieldGroup>
      {save.isError && (
        <p className="alert-text">Impossible d’enregistrer. Vérifie les champs, puis réessaie.</p>
      )}
      <Button
        type="submit"
        style={{ minWidth: 220, alignSelf: 'flex-start' }}
        disabled={save.isPending}
      >
        Enregistrer et rechercher
      </Button>
      <hr className="divider" />
      <span className="field__label">Et si besoin</span>
      <Button
        variant="secondary"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => navigate('/hebergeur')}
      >
        Proposer aussi un logement
      </Button>
      <HelpText>
        Ça ouvre ton espace hébergeur, en plus de celui-ci — même compte, même connexion.
      </HelpText>
      <AccountActions />
    </form>
  )
}

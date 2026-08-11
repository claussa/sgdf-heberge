import type { Me } from '@repo/contracts'
import { eventConfig } from '@repo/event-config'
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { AccountActions } from '../components/AccountActions'
import { api } from '../lib/api'
import { useMe, useSetMe } from '../lib/hooks'
import { Button, Field, HelpText, Input, Loading, PageTitle, Select } from '../ui'

/**
 * Profil unité (A.12). « Continuer » enregistre (onboarding SCOUT_UNIT au premier
 * passage, PATCH ensuite) puis ouvre l'annonce ; le sens de l'annonce se choisit
 * sur l'écran annonce lui-même.
 */
export function ProfilUnite() {
  const { me, isPending } = useMe()
  if (isPending) return <Loading />
  if (!me) return null
  if (me.accountType === 'INDIVIDUAL') return <Navigate to="/profil" replace />
  return <ProfilUniteForm me={me} />
}

function ProfilUniteForm({ me }: { me: Me }) {
  const navigate = useNavigate()
  const setMe = useSetMe()
  const [groupName, setGroupName] = useState(me.groupName ?? '')
  const [unitName, setUnitName] = useState(me.unitName ?? '')
  const [unitBranch, setUnitBranch] = useState(me.unitBranch ?? eventConfig.unitBranches[0])
  const [firstName, setFirstName] = useState(me.firstName ?? '')
  const [lastName, setLastName] = useState(me.lastName ?? '')
  const [phone, setPhone] = useState(me.phone ?? '')

  const save = useMutation({
    mutationFn: async () => {
      const profile = {
        groupName: groupName.trim(),
        unitName: unitName.trim(),
        unitBranch,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      }
      const res =
        me.accountType === null
          ? await api.me.onboarding.$post({ json: { accountType: 'SCOUT_UNIT', ...profile } })
          : await api.me.$patch({ json: profile })
      if (res.status !== 200) throw new Error(`enregistrement du profil : ${res.status}`)
      return res.json()
    },
    onSuccess: (fresh) => {
      setMe(fresh)
      navigate('/unite/annonce')
    },
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!save.isPending) save.mutate()
  }

  return (
    <form className="profil fade" onSubmit={onSubmit}>
      <PageTitle>Unité scoute,</PageTitle>
      <Field label="Groupe">
        <Input
          value={groupName}
          onChange={(event) => setGroupName(event.target.value)}
          aria-label="Nom du groupe"
          required
        />
      </Field>
      <Field label="Unité">
        <span className="field__pair">
          <Input
            value={unitName}
            onChange={(event) => setUnitName(event.target.value)}
            aria-label="Nom de l’unité"
            required
          />
          <Select
            value={unitBranch}
            onChange={(event) => setUnitBranch(event.target.value)}
            aria-label="Branche"
          >
            {eventConfig.unitBranches.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </Select>
        </span>
      </Field>
      <Field label="E-mail de l’unité" glose="déjà connu par la connexion">
        <Input value={me.email} disabled />
      </Field>
      <Field label="Prénom et nom du responsable">
        <span className="field__pair">
          <Input
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            placeholder="Prénom"
            aria-label="Prénom du responsable"
            autoComplete="given-name"
            required
          />
          <Input
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            placeholder="Nom"
            aria-label="Nom du responsable"
            autoComplete="family-name"
            required
          />
        </span>
      </Field>
      <Field label="Téléphone du responsable">
        <Input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          autoComplete="tel"
          required
        />
      </Field>
      {save.isError && (
        <p className="alert-text">Impossible d’enregistrer. Vérifie les champs, puis réessaie.</p>
      )}
      <Button
        type="submit"
        style={{ minWidth: 200, alignSelf: 'flex-start' }}
        disabled={save.isPending}
      >
        Continuer
      </Button>
      <HelpText>
        Pas de réservation dans ce parcours : uniquement une mise en relation. E-mail et téléphone
        sont échangés après acceptation.
      </HelpText>
      <AccountActions />
    </form>
  )
}

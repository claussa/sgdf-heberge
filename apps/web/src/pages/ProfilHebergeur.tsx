import type { Me } from '@repo/contracts'
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { AccountActions } from '../components/AccountActions'
import { api } from '../lib/api'
import { useMe, useSetMe } from '../lib/hooks'
import { Button, Field, HelpText, Input, Loading, PageTitle } from '../ui'

/**
 * Profil hébergeur (A.7) — mêmes données /me que le bénévole, sans « Nous serons »
 * ni besoins d'accessibilité. Le CTA enregistre le profil (onboarding INDIVIDUAL au
 * premier passage, PATCH ensuite) puis ouvre la création du premier logement.
 */
export function ProfilHebergeur() {
  const { me, isPending } = useMe()
  if (isPending) return <Loading />
  if (!me) return null
  if (me.accountType === 'SCOUT_UNIT') return <Navigate to="/unite" replace />
  return <ProfilHebergeurForm me={me} />
}

function ProfilHebergeurForm({ me }: { me: Me }) {
  const navigate = useNavigate()
  const setMe = useSetMe()
  const [firstName, setFirstName] = useState(me.firstName ?? '')
  const [lastName, setLastName] = useState(me.lastName ?? '')
  const [phone, setPhone] = useState(me.phone ?? '')

  const save = useMutation({
    mutationFn: async () => {
      const profile = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
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
      navigate('/hebergeur/logements/nouveau')
    },
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!save.isPending) save.mutate()
  }

  return (
    <form className="profil fade" onSubmit={onSubmit}>
      <PageTitle>J’accueille des bénévoles,</PageTitle>
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
        <Field label="Téléphone">
          <Input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            required
          />
        </Field>
      </div>
      <HelpText>Ton numéro n’est transmis au bénévole qu’après ton acceptation.</HelpText>
      {save.isError && (
        <p className="alert-text">Impossible d’enregistrer. Vérifie les champs, puis réessaie.</p>
      )}
      <Button
        type="submit"
        style={{ minWidth: 240, alignSelf: 'flex-start' }}
        disabled={save.isPending}
      >
        Créer mon premier logement
      </Button>
      <hr className="divider" />
      <span className="field__label">Et si besoin</span>
      <Button
        variant="secondary"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => navigate('/profil')}
      >
        Chercher aussi un logement, ailleurs
      </Button>
      <HelpText>
        Ça ouvre ton espace bénévole, en plus de celui-ci — même compte, même connexion.
      </HelpText>
      <AccountActions />
    </form>
  )
}

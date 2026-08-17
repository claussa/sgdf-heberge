import type { AdminUser } from '@repo/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'
import {
  Badge,
  Button,
  Card,
  Field,
  HelpText,
  Input,
  Loading,
  PageTitle,
  SectionTitle,
} from '../ui'
import './jumelage-admin.css'

const ADMIN_ADMINS_KEY = ['admin-admins'] as const

async function fetchAdmins() {
  const res = await api.admin.admins.$get()
  if (res.status === 200) return res.json()
  throw new Error(`GET /admin/admins : ${res.status}`)
}

function adminLabel(admin: AdminUser): string {
  const name = [admin.firstName, admin.lastName].filter(Boolean).join(' ')
  return name === '' ? admin.email : name
}

/**
 * /admin/administrateurs — liste des admins + promotion par e-mail. Hors
 * maquette : même registre sobre que le tableau de bord. Un e-mail inconnu crée
 * une coquille ADMIN, active dès la première connexion par magic link.
 */
export function AdminAdmins() {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const admins = useQuery({ queryKey: ADMIN_ADMINS_KEY, queryFn: fetchAdmins })

  const promote = useMutation({
    mutationFn: async (value: string) => {
      const res = await api.admin.admins.$post({ json: { email: value } })
      if (res.status !== 200) throw new Error(`POST /admin/admins : ${res.status}`)
      return res.json()
    },
    onSuccess: () => setEmail(''),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ADMIN_ADMINS_KEY }),
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!promote.isPending) promote.mutate(email.trim())
  }

  return (
    <div className="ja-col ja-col--760 fade">
      <Link to="/admin" className="ja-link">
        ← Tableau de bord
      </Link>
      <PageTitle>Administrateurs,</PageTitle>
      {admins.isPending && <Loading />}
      {admins.isError && (
        <p className="alert-text">Impossible de charger la liste. Réessaie dans un instant.</p>
      )}
      {admins.data && (
        <Card className="ja-card-stack">
          {admins.data.items.map((admin) => (
            <div key={admin.id} className="ja-row-head">
              <span>
                <span className="ja-row-title">{adminLabel(admin)}</span>
                {adminLabel(admin) !== admin.email && (
                  <span className="ja-card-sub"> · {admin.email}</span>
                )}
              </span>
              {admin.accountType === null && <Badge>Jamais connecté</Badge>}
            </div>
          ))}
        </Card>
      )}
      <Card className="ja-card-stack">
        <SectionTitle>Ajouter un administrateur,</SectionTitle>
        <form className="ja-col" onSubmit={onSubmit}>
          <Field label="Adresse e-mail">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="prenom.nom@exemple.fr"
              maxLength={320}
              required
            />
          </Field>
          <HelpText>
            Si le compte existe, il devient administrateur immédiatement. Sinon, il le deviendra à
            sa première connexion avec cette adresse.
          </HelpText>
          {promote.isError && (
            <p className="alert-text">
              Impossible d’ajouter cet e-mail. Vérifie l’adresse, puis réessaie.
            </p>
          )}
          {promote.isSuccess && (
            <p className="ja-card-sub">{adminLabel(promote.data)} est maintenant administrateur.</p>
          )}
          <div className="ja-actions">
            <Button type="submit" disabled={promote.isPending}>
              Ajouter
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

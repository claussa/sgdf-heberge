import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api } from '../lib/api'
import { ME_QUERY_KEY, useLogout } from '../lib/hooks'

/**
 * Bloc commun au bas des écrans profil : déconnexion, suppression du compte
 * (art. 17, confirm() natif) et export des données (art. 20, JSON servi par l'API).
 */
export function AccountActions() {
  const logout = useLogout()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const remove = useMutation({
    mutationFn: async () => {
      const res = await api.me.$delete()
      if (res.status !== 200) throw new Error(`DELETE /me : ${res.status}`)
    },
    onSuccess: () => {
      queryClient.setQueryData(ME_QUERY_KEY, null)
      navigate('/connexion')
    },
  })

  const onDelete = () => {
    const confirmed = window.confirm(
      'Supprimer ton compte ? Toutes tes données seront effacées. Cette action est irréversible.',
    )
    if (confirmed && !remove.isPending) remove.mutate()
  }

  return (
    <>
      <hr className="divider" />
      <div className="account-actions">
        <button
          type="button"
          className="account-actions__logout"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          Se déconnecter
        </button>
        <button
          type="button"
          className="account-actions__delete"
          onClick={onDelete}
          disabled={remove.isPending}
        >
          Supprimer mon compte
        </button>
        <a
          className="account-actions__export"
          href="/api/me/export"
          target="_blank"
          rel="noreferrer"
        >
          Exporter mes données
        </a>
      </div>
      {remove.isError && <p className="alert-text">La suppression a échoué. Réessaie.</p>}
    </>
  )
}

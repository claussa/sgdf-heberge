import type { Me } from '@repo/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api } from './api'

export const ME_QUERY_KEY = ['me'] as const

/** 401 = anonyme (data `null`), pas une erreur. Les autres statuts remontent en `error`. */
async function fetchMe() {
  const res = await api.me.$get()
  if (res.status === 200) return res.json()
  if (res.status === 401) return null
  // Statut hors contrat (ex. 500) — invisible pour TS, bien réel au runtime :
  // on remonte une erreur et React Query réessaie.
  throw new Error('GET /me : statut inattendu')
}

/**
 * Profil du compte connecté.
 * - `me` : le profil, ou `null` (anonyme, chargement ou erreur)
 * - `isAnonymous` : vrai uniquement quand /me a répondu 401
 */
export function useMe() {
  const query = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    staleTime: 60_000,
  })
  return {
    ...query,
    me: query.data ?? null,
    isAnonymous: query.isSuccess && query.data === null,
  }
}

/** Pousse un profil frais (réponse d'onboarding ou de PATCH /me) dans le cache. */
export function useSetMe() {
  const queryClient = useQueryClient()
  return (me: Me) => {
    queryClient.setQueryData(ME_QUERY_KEY, me)
  }
}

/** Déconnexion : révoque la session, vide le cache, retourne à la connexion. */
export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async () => {
      await api.auth.logout.$post()
    },
    // Même si la session était déjà morte (401), on repart de l'état anonyme.
    onSettled: () => {
      queryClient.setQueryData(ME_QUERY_KEY, null)
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' })
      navigate('/connexion')
    },
  })
}

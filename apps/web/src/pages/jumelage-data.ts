import { useQuery } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { api } from '../lib/api'

/**
 * Données jumelage partagées par les écrans unité : annonce (A.13), liste (A.14)
 * et relations (A.16). Toute mutation jumelage invalide MY_JUMELAGE_KEY.
 */

/** Réponse de GET /my/jumelage (MyJumelageResponseSchema) : ad, received, relations, sentPending. */
export type MyJumelage = InferResponseType<typeof api.my.jumelage.$get, 200>

export const MY_JUMELAGE_KEY = ['my-jumelage'] as const

/** Préfixe des listes d'annonces (A.14) — invalidé après publication/retrait. */
export const JUMELAGE_ADS_KEY = ['jumelage-ads'] as const

async function fetchMyJumelage() {
  const res = await api.my.jumelage.$get()
  if (res.status === 200) return res.json()
  throw new Error(`GET /my/jumelage : ${res.status}`)
}

/** Espace jumelage du compte : ad, received, relations, sentPending. */
export function useMyJumelage() {
  return useQuery({ queryKey: MY_JUMELAGE_KEY, queryFn: fetchMyJumelage })
}

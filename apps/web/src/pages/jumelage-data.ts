import type { JumelageAd } from '@repo/contracts'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

/**
 * Données jumelage partagées par les écrans unité : annonce (A.13), liste (A.14)
 * et relations (A.16). Toute mutation jumelage invalide MY_JUMELAGE_KEY.
 *
 * Types de réponse : miroirs des schémas de @repo/contracts (MyJumelageResponseSchema
 * et associés) — même motif que fetchMe (lib/hooks.ts) et MesDemandes : le json()
 * du RPC ressort en any dans le programme complet, on fixe donc le type au contrat.
 */

/** Miroir de MyJumelageAdSchema. */
export type MyJumelageAd = JumelageAd & { status: 'ACTIVE' | 'WITHDRAWN' }

type ReceivedBase = {
  id: string
  unitName: string
  unitBranch: string | null
  peopleLabel: string | null
  dates: string | null
  message: string | null
  createdAt: string
}

/** Miroir de JumelageReceivedContactSchema — coordonnées uniquement si ACCEPTED. */
export type JumelageReceivedContact =
  | (ReceivedBase & { status: 'PENDING' })
  | (ReceivedBase & {
      status: 'ACCEPTED'
      contact: { name: string; email: string; phone: string }
    })

/** Miroir de JumelageRelationSchema — mise en relation aboutie, coordonnées mutuelles. */
export type JumelageRelation = {
  id: string
  unitName: string
  unitBranch: string | null
  contactName: string
  email: string
  phone: string
  acceptedAt: string
}

/** Miroir de MyJumelageResponseSchema. */
export type MyJumelage = {
  ad: MyJumelageAd | null
  received: JumelageReceivedContact[]
  relations: JumelageRelation[]
  sentPending: Array<{ id: string; adId: string; unitName: string; createdAt: string }>
}

export const MY_JUMELAGE_KEY = ['my-jumelage'] as const

/** Préfixe des listes d'annonces (A.14) — invalidé après publication/retrait. */
export const JUMELAGE_ADS_KEY = ['jumelage-ads'] as const

async function fetchMyJumelage(): Promise<MyJumelage> {
  const res = await api.my.jumelage.$get()
  if (res.status === 200) return res.json()
  throw new Error(`GET /my/jumelage : ${res.status}`)
}

/** Espace jumelage du compte : ad, received, relations, sentPending. */
export function useMyJumelage() {
  return useQuery({ queryKey: MY_JUMELAGE_KEY, queryFn: fetchMyJumelage })
}

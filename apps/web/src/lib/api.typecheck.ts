import { api } from './api'

/**
 * Garde-fou de compilation (§5 — typage bout-en-bout du RPC Hono).
 * Jamais importé par l'app : il n'existe que pour `check-types`.
 *
 * Le typage des corps de réponse a déjà été perdu silencieusement : le d.ts publié
 * de @hono/zod-openapi@1.5.2 référence un alias `zodModule` jamais importé ; le type
 * d'erreur TS qui en résulte se comporte comme `any` sans aucun diagnostic (masqué
 * par skipLibCheck). Corrigé par patches/@hono__zod-openapi@1.5.2.patch. Ce fichier
 * fait échouer `check-types` si la régression revient :
 * - si `res.json()` redevient any, le @ts-expect-error ci-dessous ressort en
 *   « Unused '@ts-expect-error' directive » ;
 * - les affectations typées vérifient que le corps reste celui de MeSchema.
 */
export async function assertRpcResponseTyping() {
  const res = await api.me.$get()
  if (res.status !== 200) throw new Error('vérification de types uniquement')
  const data = await res.json()
  const id: string = data.id
  const hasListings: boolean = data.hasListings
  // @ts-expect-error — champ inexistant : doit rester une erreur de compilation
  data.champInexistant
  return { id, hasListings }
}

import { Navigate } from 'react-router'
import { useMe } from '../lib/hooks'
import { Loading } from '../ui'

/**
 * Route « / » : aiguillage selon l'état du compte.
 * Anonyme → /connexion · pas onboardé → /inscription · INDIVIDUAL → /recherche ·
 * SCOUT_UNIT → /jumelage.
 */
export function Dispatcher() {
  const { me, isPending } = useMe()
  if (isPending) return <Loading />
  if (!me) return <Navigate to="/connexion" replace />
  if (me.accountType === null) return <Navigate to="/inscription" replace />
  return <Navigate to={me.accountType === 'INDIVIDUAL' ? '/recherche' : '/jumelage'} replace />
}

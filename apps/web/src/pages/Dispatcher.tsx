import { Navigate } from 'react-router'
import { useMe } from '../lib/hooks'
import { Loading } from '../ui'

/**
 * Route « / » : aiguillage selon l'état du compte.
 * Anonyme → /connexion · pas onboardé → /inscription · volontaire → /recherche ·
 * hébergeur pur → /hebergeur/logements · SCOUT_UNIT → /jumelage.
 */
export function Dispatcher() {
  const { me, isPending } = useMe()
  if (isPending) return <Loading />
  if (!me) return <Navigate to="/connexion" replace />
  if (me.accountType === null) return <Navigate to="/inscription" replace />
  if (me.accountType !== 'INDIVIDUAL') return <Navigate to="/jumelage" replace />
  return <Navigate to={me.seeksAccommodation ? '/recherche' : '/hebergeur/logements'} replace />
}

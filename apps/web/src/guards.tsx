import { Navigate, Outlet } from 'react-router'
import { useMe } from './lib/hooks'
import { Loading } from './ui'

/**
 * Routes privées : attente sobre pendant le chargement de /me, redirection vers
 * la connexion si anonyme (ou si /me est en erreur — on ne laisse rien passer).
 */
export function RequireAuth() {
  const { me, isPending } = useMe()
  if (isPending) return <Loading />
  if (!me) return <Navigate to="/connexion" replace />
  return <Outlet />
}

/** accountType null = onboarding pas fait → « Je m'inscris comme… ». Sous RequireAuth. */
export function RequireOnboarded() {
  const { me } = useMe()
  if (me && me.accountType === null) return <Navigate to="/inscription" replace />
  return <Outlet />
}

/** Réservé au rôle ADMIN. Sous RequireAuth. */
export function RequireAdmin() {
  const { me } = useMe()
  if (me?.role !== 'ADMIN') return <Navigate to="/" replace />
  return <Outlet />
}

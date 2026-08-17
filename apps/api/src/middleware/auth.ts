import type { AccountType } from '@repo/db'
import { deleteCookie, getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { AppError } from '../errors'
import { getDb } from '../lib/prisma'
import { type ValidatedSession, validateSession } from '../services/auth-service'

export const SESSION_COOKIE = 'heberge_session'

export interface AuthVariables {
  user: ValidatedSession['user']
  sessionId: string
  sessionToken: string
}

/**
 * Session httpOnly (§9). Cookie posé côté serveur en Set-Cookie — précisément
 * pour échapper au plafond 7 jours de Safari/ITP sur les cookies JS.
 */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const raw = getCookie(c, SESSION_COOKIE)
  if (!raw) {
    throw new AppError('UNAUTHORIZED', 'Authentification requise')
  }
  const validated = await validateSession(getDb(), raw)
  if (!validated) {
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    throw new AppError('UNAUTHORIZED', 'Session expirée ou révoquée')
  }
  c.set('user', validated.user)
  c.set('sessionId', validated.sessionId)
  c.set('sessionToken', raw)
  await next()
})

/**
 * À empiler APRÈS requireAuth. Exige un compte onboardé du bon type :
 * les routes logement/demandes sont réservées aux INDIVIDUAL, le jumelage aux
 * SCOUT_UNIT (cloisonnement des parcours — un particulier n'accueille pas d'unité).
 */
export function requireAccountType(type: AccountType) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const user = c.get('user')
    if (user.accountType === null) {
      throw new AppError('FORBIDDEN', "Termine d'abord ton inscription")
    }
    if (user.accountType !== type) {
      throw new AppError('FORBIDDEN', 'Ce parcours ne correspond pas à ton type de compte')
    }
    await next()
  })
}

/** À empiler APRÈS requireAuth. Premier admin en seed/SQL, puis promotion par e-mail (/admin/admins). */
export const requireAdmin = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  if (c.get('user').role !== 'ADMIN') {
    throw new AppError('FORBIDDEN', 'Réservé aux administrateurs')
  }
  await next()
})

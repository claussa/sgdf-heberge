import { deleteCookie, getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { AppError } from '../errors'
import { getDb } from '../lib/prisma'
import { type ValidatedSession, validateSession } from '../services/auth-service'

export const SESSION_COOKIE = 'adherents_session'

export interface AuthVariables {
  member: ValidatedSession['member']
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
  c.set('member', validated.member)
  c.set('sessionId', validated.sessionId)
  c.set('sessionToken', raw)
  await next()
})

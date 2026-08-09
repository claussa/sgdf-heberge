import { type ErrorCode, ErrorResponseSchema } from '@repo/contracts'
import { Prisma } from '@repo/db'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { logger } from './lib/logger'

const STATUS_BY_CODE: Record<ErrorCode, 400 | 401 | 403 | 404 | 409 | 429 | 500> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
}

export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

function errorBody(code: ErrorCode, message: string) {
  return ErrorResponseSchema.parse({ error: { code, message } })
}

/**
 * Handler d'erreur centralisé (§5).
 * Jamais d'erreur Prisma brute vers le client : elle expose la structure du schéma
 * et parfois des valeurs. Mapping P2002/P2025 → codes applicatifs.
 */
export function handleError(error: Error, c: Context): Response {
  if (error instanceof AppError) {
    return c.json(errorBody(error.code, error.message), STATUS_BY_CODE[error.code])
  }

  if (error instanceof HTTPException) {
    if (error.status === 401) {
      return c.json(errorBody('UNAUTHORIZED', 'Authentification requise'), 401)
    }
    return c.json(errorBody('INTERNAL', 'Erreur interne'), error.status >= 500 ? 500 : 400)
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return c.json(errorBody('CONFLICT', 'Un enregistrement identique existe déjà'), 409)
      case 'P2025':
        return c.json(errorBody('NOT_FOUND', 'Ressource introuvable'), 404)
      default:
        logger.error({ prismaCode: error.code }, 'erreur Prisma non mappée')
        return c.json(errorBody('INTERNAL', 'Erreur interne'), 500)
    }
  }

  // Inclut les ZodError d'un Schema.parse avant c.json : bug serveur, réponse générique.
  logger.error({ err: { name: error.name, message: error.message } }, 'erreur non gérée')
  return c.json(errorBody('INTERNAL', 'Erreur interne'), 500)
}

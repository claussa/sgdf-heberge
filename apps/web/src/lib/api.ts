import type { AppType } from '@repo/api'
import { hc } from 'hono/client'

/**
 * Client RPC Hono typé (§5) : autocomplétion et vérification à la compilation,
 * sans étape de génération. `AppType` est importé en type uniquement — aucun code
 * de l'API (ni de Prisma) ne finit dans le bundle front (§4).
 */
export const api = hc<AppType>('/api')

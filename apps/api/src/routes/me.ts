import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import {
  ErrorResponseSchema,
  type Me,
  MeSchema,
  OkResponseSchema,
  OnboardingSchema,
  ProfileUpdateSchema,
  UserExportSchema,
} from '@repo/contracts'
import { exportUserData } from '@repo/db'
import { deleteCookie } from 'hono/cookie'
import { getDb } from '../lib/prisma'
import { type AuthVariables, requireAuth, SESSION_COOKIE } from '../middleware/auth'
import { USER_DTO_SELECT } from '../services/auth-service'
import {
  completeOnboarding,
  deleteUserAccount,
  getMe,
  updateProfile,
} from '../services/user-service'

const error401 = {
  description: 'Non authentifié',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}

const getMeRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['me'],
  summary: 'Profil du compte connecté',
  description: 'accountType null = onboarding pas encore fait (écran « Je m’inscris comme… »).',
  middleware: [requireAuth] as const,
  responses: {
    200: { description: 'Profil', content: { 'application/json': { schema: MeSchema } } },
    401: error401,
  },
})

const onboardingRoute = createRoute({
  method: 'post',
  path: '/me/onboarding',
  tags: ['me'],
  summary: 'Choisir son type de compte et compléter son profil (une seule fois)',
  middleware: [requireAuth] as const,
  request: {
    body: { content: { 'application/json': { schema: OnboardingSchema } }, required: true },
  },
  responses: {
    200: { description: 'Profil complété', content: { 'application/json': { schema: MeSchema } } },
    401: error401,
    409: {
      description: 'Le type de compte est définitif',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const updateMeRoute = createRoute({
  method: 'patch',
  path: '/me',
  tags: ['me'],
  summary: 'Mettre à jour son profil',
  middleware: [requireAuth] as const,
  request: {
    body: { content: { 'application/json': { schema: ProfileUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Profil mis à jour',
      content: { 'application/json': { schema: MeSchema } },
    },
    401: error401,
  },
})

const deleteMeRoute = createRoute({
  method: 'delete',
  path: '/me',
  tags: ['me'],
  summary: 'Supprimer son compte (art. 17)',
  description:
    'Annule d’abord les demandes acceptées des deux côtés (les personnes concernées sont ' +
    'prévenues par e-mail), puis efface toutes les données. Irréversible.',
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Compte supprimé',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    401: error401,
  },
})

const exportMeRoute = createRoute({
  method: 'get',
  path: '/me/export',
  tags: ['me'],
  summary: 'Exporter ses données (art. 20)',
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Export complet, déchiffré',
      content: { 'application/json': { schema: UserExportSchema } },
    },
    401: error401,
  },
})

/** Relit le profil APRÈS écriture (le user du contexte date du requireAuth d'entrée). */
async function freshMe(userId: string): Promise<Me> {
  const db = getDb()
  const fresh = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: USER_DTO_SELECT,
  })
  return getMe(db, fresh)
}

export const meRouter = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(getMeRoute, async (c) => {
    return c.json(MeSchema.parse(await getMe(getDb(), c.get('user'))), 200)
  })
  .openapi(onboardingRoute, async (c) => {
    await completeOnboarding(getDb(), c.get('user'), c.req.valid('json'))
    return c.json(MeSchema.parse(await freshMe(c.get('user').id)), 200)
  })
  .openapi(updateMeRoute, async (c) => {
    await updateProfile(getDb(), c.get('user'), c.req.valid('json'))
    return c.json(MeSchema.parse(await freshMe(c.get('user').id)), 200)
  })
  .openapi(deleteMeRoute, async (c) => {
    await deleteUserAccount(getDb(), c.get('user').id)
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  })
  .openapi(exportMeRoute, async (c) => {
    const data = await exportUserData(getDb(), c.get('user').id)
    return c.json(
      UserExportSchema.parse({
        format: data.format,
        version: data.version,
        user: JSON.parse(JSON.stringify(data.user)) as Record<string, unknown>,
      }),
      200,
    )
  })

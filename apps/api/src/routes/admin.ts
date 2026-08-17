import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  AdminListingSchema,
  AdminListingsResponseSchema,
  AdminListingUpsertSchema,
  AdminMetricsSchema,
  AdminPromoteSchema,
  AdminUserSchema,
  AdminUsersResponseSchema,
  ErrorResponseSchema,
  OkResponseSchema,
} from '@repo/contracts'
import { getDb } from '../lib/prisma'
import { type AuthVariables, requireAdmin, requireAuth } from '../middleware/auth'
import {
  createInstitutionalListing,
  deleteInstitutionalListing,
  getMetrics,
  listAdmins,
  listInstitutionalListings,
  promoteAdmin,
  updateInstitutionalListing,
} from '../services/admin-service'

/**
 * Espace admin (arbitrage 8 du plan v1) : métriques par site, CRUD des logements
 * institutionnels, et gestion des administrateurs (le premier admin est posé en
 * seed/SQL ; les suivants sont promus par e-mail depuis /admin/administrateurs).
 */

const error401 = {
  description: 'Non authentifié',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}
const error403 = {
  description: 'Réservé aux administrateurs',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}
const error404 = {
  description: 'Logement institutionnel introuvable',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}

const idParam = z.object({ id: z.string().min(1) })

const metricsRoute = createRoute({
  method: 'get',
  path: '/admin/metrics',
  tags: ['admin'],
  summary: 'Métriques par site (logements, demandes, jumelage) et comptes',
  middleware: [requireAuth, requireAdmin] as const,
  responses: {
    200: {
      description: 'Métriques',
      content: { 'application/json': { schema: AdminMetricsSchema } },
    },
    401: error401,
    403: error403,
  },
})

const listListingsRoute = createRoute({
  method: 'get',
  path: '/admin/listings',
  tags: ['admin'],
  summary: 'Logements institutionnels (hôtels et collectifs, tous sites)',
  middleware: [requireAuth, requireAdmin] as const,
  responses: {
    200: {
      description: 'Logements institutionnels',
      content: { 'application/json': { schema: AdminListingsResponseSchema } },
    },
    401: error401,
    403: error403,
  },
})

const createListingRoute = createRoute({
  method: 'post',
  path: '/admin/listings',
  tags: ['admin'],
  summary: 'Créer un logement institutionnel',
  description:
    'Hôtel : fiche prix/code + bouton vers la plateforme de réservation (pas de ' +
    'demande in-app). Collectif (gymnase…) : flux de demande standard, le compte ' +
    'admin répond comme un hébergeur.',
  middleware: [requireAuth, requireAdmin] as const,
  request: {
    body: { content: { 'application/json': { schema: AdminListingUpsertSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'Logement créé',
      content: { 'application/json': { schema: AdminListingSchema } },
    },
    400: {
      description: 'Dates invalides',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: error401,
    403: error403,
  },
})

const updateListingRoute = createRoute({
  method: 'patch',
  path: '/admin/listings/{id}',
  tags: ['admin'],
  summary: 'Modifier un logement institutionnel (corps complet)',
  description:
    "N'importe quel admin peut éditer n'importe quel logement HOTEL/COLLECTIVE. " +
    'Les logements de particuliers ne sont pas accessibles par cette route.',
  middleware: [requireAuth, requireAdmin] as const,
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: AdminListingUpsertSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Logement mis à jour',
      content: { 'application/json': { schema: AdminListingSchema } },
    },
    400: {
      description: 'Dates invalides',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: error401,
    403: error403,
    404: error404,
  },
})

const deleteListingRoute = createRoute({
  method: 'delete',
  path: '/admin/listings/{id}',
  tags: ['admin'],
  summary: 'Supprimer un logement institutionnel',
  description:
    'Annule d’abord les demandes acceptées (les demandeurs sont prévenus par ' +
    'e-mail), puis supprime le logement.',
  middleware: [requireAuth, requireAdmin] as const,
  request: { params: idParam },
  responses: {
    200: {
      description: 'Logement supprimé',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    401: error401,
    403: error403,
    404: error404,
  },
})

const listAdminsRoute = createRoute({
  method: 'get',
  path: '/admin/admins',
  tags: ['admin'],
  summary: 'Liste des administrateurs',
  middleware: [requireAuth, requireAdmin] as const,
  responses: {
    200: {
      description: 'Administrateurs',
      content: { 'application/json': { schema: AdminUsersResponseSchema } },
    },
    401: error401,
    403: error403,
  },
})

const promoteAdminRoute = createRoute({
  method: 'post',
  path: '/admin/admins',
  tags: ['admin'],
  summary: 'Promouvoir un compte administrateur par e-mail',
  description:
    'Compte existant : passe role=ADMIN. E-mail inconnu : crée une coquille ADMIN, ' +
    'la personne devient admin à sa première connexion par magic link. Idempotent.',
  middleware: [requireAuth, requireAdmin] as const,
  request: {
    body: { content: { 'application/json': { schema: AdminPromoteSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Compte administrateur (promu ou déjà admin)',
      content: { 'application/json': { schema: AdminUserSchema } },
    },
    401: error401,
    403: error403,
  },
})

export const adminRouter = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(metricsRoute, async (c) => {
    const metrics = await getMetrics(getDb())
    return c.json(AdminMetricsSchema.parse(metrics), 200)
  })
  .openapi(listListingsRoute, async (c) => {
    const items = await listInstitutionalListings(getDb())
    return c.json(AdminListingsResponseSchema.parse({ items }), 200)
  })
  .openapi(createListingRoute, async (c) => {
    const listing = await createInstitutionalListing(getDb(), c.get('user'), c.req.valid('json'))
    return c.json(AdminListingSchema.parse(listing), 201)
  })
  .openapi(updateListingRoute, async (c) => {
    const listing = await updateInstitutionalListing(
      getDb(),
      c.req.valid('param').id,
      c.req.valid('json'),
    )
    return c.json(AdminListingSchema.parse(listing), 200)
  })
  .openapi(deleteListingRoute, async (c) => {
    await deleteInstitutionalListing(getDb(), c.req.valid('param').id)
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  })
  .openapi(listAdminsRoute, async (c) => {
    const items = await listAdmins(getDb())
    return c.json(AdminUsersResponseSchema.parse({ items }), 200)
  })
  .openapi(promoteAdminRoute, async (c) => {
    const admin = await promoteAdmin(getDb(), c.req.valid('json').email)
    return c.json(AdminUserSchema.parse(admin), 200)
  })

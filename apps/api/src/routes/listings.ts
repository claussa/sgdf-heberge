import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  ErrorResponseSchema,
  ListingDetailSchema,
  ListingSearchQuerySchema,
  ListingSearchResponseSchema,
  ListingStatusUpdateSchema,
  ListingUpdateSchema,
  ListingUpsertSchema,
  MyListingSchema,
  MyListingsResponseSchema,
  OkResponseSchema,
} from '@repo/contracts'
import { AppError } from '../errors'
import { getDb } from '../lib/prisma'
import { type AuthVariables, requireAccountType, requireAuth } from '../middleware/auth'
import {
  createListing,
  deleteListing,
  getListingDetail,
  getMyListings,
  searchListings,
  setListingStatus,
  updateListing,
} from '../services/listing-service'

// Toute l'app est derrière login, recherche comprise (arbitrage 11 du plan v1).
// Les routes /my/listings sont réservées aux INDIVIDUAL onboardés (cloisonnement).

const error400 = {
  description: 'Requête invalide',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}
const error401 = {
  description: 'Non authentifié',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}
const error403 = {
  description: 'Réservé aux comptes bénévoles/hébergeurs onboardés',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}
const error404 = {
  description: 'Logement introuvable — ownership vérifié dans le WHERE, pas de distinction 403/404',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}

const idParam = z.object({ id: z.string().min(1) })

const searchListingsRoute = createRoute({
  method: 'get',
  path: '/listings',
  tags: ['listings'],
  summary: 'Rechercher des logements',
  description:
    'Cartes SANS adresse (seule la zone « Paris 12e » est publique). Exclut les logements ' +
    'complets (FULL) et masqués. Tri par distance au site, valeurs inconnues en dernier.',
  middleware: [requireAuth] as const,
  request: { query: ListingSearchQuerySchema },
  responses: {
    200: {
      description: 'Résultats paginés',
      content: { 'application/json': { schema: ListingSearchResponseSchema } },
    },
    400: error400,
    401: error401,
  },
})

const listingDetailRoute = createRoute({
  method: 'get',
  path: '/listings/{id}',
  tags: ['listings'],
  summary: "Fiche publique d'un logement",
  description:
    'Identité hébergeur réduite à « chez Claire M. » — coordonnées et adresse complète ' +
    "révélées uniquement à l'acceptation d'une demande. Un logement masqué n'est visible " +
    'que de son propriétaire.',
  middleware: [requireAuth] as const,
  request: { params: idParam },
  responses: {
    200: {
      description: 'Fiche du logement',
      content: { 'application/json': { schema: ListingDetailSchema } },
    },
    401: error401,
    404: error404,
  },
})

const myListingsRoute = createRoute({
  method: 'get',
  path: '/my/listings',
  tags: ['listings'],
  summary: 'Mes logements',
  description: 'Vue propriétaire : adresse complète, statut, masquage, demandes en attente.',
  middleware: [requireAuth, requireAccountType('INDIVIDUAL')] as const,
  responses: {
    200: {
      description: 'Logements du compte',
      content: { 'application/json': { schema: MyListingsResponseSchema } },
    },
    401: error401,
    403: error403,
  },
})

const createListingRoute = createRoute({
  method: 'post',
  path: '/my/listings',
  tags: ['listings'],
  summary: 'Créer un logement',
  description:
    'Tout compte bénévole peut devenir hébergeur. Catégorie PRIVATE forcée (les logements ' +
    "institutionnels passent par les routes admin). L'adresse est un résultat BAN choisi " +
    'côté client ; capacité = somme des couchages, recalculée en transaction.',
  middleware: [requireAuth, requireAccountType('INDIVIDUAL')] as const,
  request: {
    body: { content: { 'application/json': { schema: ListingUpsertSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'Logement créé',
      content: { 'application/json': { schema: MyListingSchema } },
    },
    400: error400,
    401: error401,
    403: error403,
  },
})

const updateListingRoute = createRoute({
  method: 'patch',
  path: '/my/listings/{id}',
  tags: ['listings'],
  summary: 'Modifier un logement',
  description:
    'Les couchages sont remplacés en bloc et la capacité recalculée en transaction. ' +
    "L'adresse est optionnelle : absente, elle est conservée telle quelle.",
  middleware: [requireAuth, requireAccountType('INDIVIDUAL')] as const,
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: ListingUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Logement mis à jour',
      content: { 'application/json': { schema: MyListingSchema } },
    },
    400: error400,
    401: error401,
    403: error403,
    404: error404,
  },
})

const listingStatusRoute = createRoute({
  method: 'patch',
  path: '/my/listings/{id}/status',
  tags: ['listings'],
  summary: 'Changer le statut (libre / complet)',
  description:
    'Action explicite de l’hébergeur : réactive aussi un logement masqué pour inactivité ' +
    '(hiddenAt remis à null).',
  middleware: [requireAuth, requireAccountType('INDIVIDUAL')] as const,
  request: {
    params: idParam,
    body: {
      content: { 'application/json': { schema: ListingStatusUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Statut mis à jour',
      content: { 'application/json': { schema: MyListingSchema } },
    },
    401: error401,
    403: error403,
    404: error404,
  },
})

const deleteListingRoute = createRoute({
  method: 'delete',
  path: '/my/listings/{id}',
  tags: ['listings'],
  summary: 'Supprimer un logement',
  description:
    'Annule d’abord les demandes acceptées (les demandeurs sont prévenus par e-mail), ' +
    'puis supprime le logement, ses couchages et ses demandes. Irréversible.',
  middleware: [requireAuth, requireAccountType('INDIVIDUAL')] as const,
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

export const listingsRouter = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(searchListingsRoute, async (c) => {
    const result = await searchListings(getDb(), c.req.valid('query'))
    return c.json(ListingSearchResponseSchema.parse(result), 200)
  })
  .openapi(listingDetailRoute, async (c) => {
    const detail = await getListingDetail(getDb(), c.req.valid('param').id, c.get('user').id)
    if (!detail) throw new AppError('NOT_FOUND', 'Logement introuvable')
    return c.json(ListingDetailSchema.parse(detail), 200)
  })
  .openapi(myListingsRoute, async (c) => {
    const items = await getMyListings(getDb(), c.get('user').id)
    return c.json(MyListingsResponseSchema.parse({ items }), 200)
  })
  .openapi(createListingRoute, async (c) => {
    const listing = await createListing(getDb(), c.get('user').id, c.req.valid('json'))
    return c.json(MyListingSchema.parse(listing), 201)
  })
  .openapi(updateListingRoute, async (c) => {
    const listing = await updateListing(
      getDb(),
      c.get('user').id,
      c.req.valid('param').id,
      c.req.valid('json'),
    )
    return c.json(MyListingSchema.parse(listing), 200)
  })
  .openapi(listingStatusRoute, async (c) => {
    const listing = await setListingStatus(
      getDb(),
      c.get('user').id,
      c.req.valid('param').id,
      c.req.valid('json').status,
    )
    return c.json(MyListingSchema.parse(listing), 200)
  })
  .openapi(deleteListingRoute, async (c) => {
    await deleteListing(getDb(), c.get('user').id, c.req.valid('param').id)
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  })

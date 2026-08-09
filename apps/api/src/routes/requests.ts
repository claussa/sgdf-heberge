import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  ErrorResponseSchema,
  MyRequestsResponseSchema,
  OkResponseSchema,
  ReceivedRequestsResponseSchema,
  RequestCreateSchema,
  RequestMessageCreateSchema,
} from '@repo/contracts'
import { getDb } from '../lib/prisma'
import { type AuthVariables, requireAccountType, requireAuth } from '../middleware/auth'
import { assertWithinLimit, clientIp, RateLimiter } from '../middleware/rate-limit'
import {
  acceptRequest,
  addMessage,
  cancelRequest,
  createRequest,
  declineRequest,
  listMyRequests,
  listReceivedRequests,
} from '../services/request-service'

// Anti-spam sur la création de demandes (plan v1 « Divers API ») : chaque demande
// déclenche un email vers l'hébergeur — sans limite, l'endpoint devient un canon à
// mails. Exporté pour être réinitialisé entre les tests.
export const requestIpLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 20 })

const error400 = {
  description: 'Requête invalide (corps, ou dates hors de la disponibilité du logement)',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}
const error401 = {
  description: 'Non authentifié',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}
const error403 = {
  description: 'Réservé aux comptes bénévoles onboardés',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}
const error404 = {
  description: 'Introuvable — ownership vérifié dans le WHERE, pas de distinction 403/404',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}
const error409 = {
  description: 'Demande expirée, déjà traitée, quota atteint ou doublon',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}
const error429 = {
  description: 'Trop de requêtes',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}

const idParam = z.object({ id: z.string().min(1) })

const createRequestRoute = createRoute({
  method: 'post',
  path: '/listings/{id}/requests',
  tags: ['requests'],
  summary: "Solliciter un logement (demande d'hébergement)",
  description:
    'Quota de 3 sollicitations en attente par demandeur, une seule demande active par ' +
    'logement. Le message accompagne la demande et ouvre le fil de discussion. ' +
    "L'hébergeur est prévenu par email avec le téléphone du demandeur.",
  middleware: [requireAuth, requireAccountType('INDIVIDUAL')] as const,
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: RequestCreateSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'Demande créée',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    400: error400,
    401: error401,
    403: error403,
    404: error404,
    409: error409,
    429: error429,
  },
})

const myRequestsRoute = createRoute({
  method: 'get',
  path: '/my/requests',
  tags: ['requests'],
  summary: 'Mes demandes (vue demandeur)',
  description:
    "Coordonnées complètes de l'hébergeur UNIQUEMENT sur une demande acceptée (union " +
    'discriminée). Une PENDING périmée est présentée EXPIRED sans attendre le job. ' +
    'Les demandes annulées ne sont pas listées.',
  middleware: [requireAuth, requireAccountType('INDIVIDUAL')] as const,
  responses: {
    200: {
      description: 'Demandes émises + quota',
      content: { 'application/json': { schema: MyRequestsResponseSchema } },
    },
    401: error401,
    403: error403,
  },
})

const receivedRequestsRoute = createRoute({
  method: 'get',
  path: '/my/received-requests',
  tags: ['requests'],
  summary: 'Demandes reçues sur mes logements (vue hébergeur)',
  description:
    'Téléphone et besoins d’accessibilité du demandeur transmis d’emblée — c’est ' +
    'l’hébergeur qui rappelle. Alerte sur-capacité si la demande dépasse les places.',
  middleware: [requireAuth, requireAccountType('INDIVIDUAL')] as const,
  responses: {
    200: {
      description: 'Demandes reçues',
      content: { 'application/json': { schema: ReceivedRequestsResponseSchema } },
    },
    401: error401,
    403: error403,
  },
})

const acceptRequestRoute = createRoute({
  method: 'post',
  path: '/requests/{id}/accept',
  tags: ['requests'],
  summary: 'Accepter une demande (hébergeur)',
  description:
    'Révèle les coordonnées complètes au demandeur (par email) et annule ' +
    'automatiquement ses autres demandes en attente — les hébergeurs concernés sont prévenus.',
  middleware: [requireAuth] as const,
  request: { params: idParam },
  responses: {
    200: {
      description: 'Demande acceptée',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    401: error401,
    404: error404,
    409: error409,
  },
})

const declineRequestRoute = createRoute({
  method: 'post',
  path: '/requests/{id}/decline',
  tags: ['requests'],
  summary: 'Refuser une demande (hébergeur)',
  middleware: [requireAuth] as const,
  request: { params: idParam },
  responses: {
    200: {
      description: 'Demande refusée',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    401: error401,
    404: error404,
    409: error409,
  },
})

const cancelRequestRoute = createRoute({
  method: 'post',
  path: '/requests/{id}/cancel',
  tags: ['requests'],
  summary: 'Annuler une demande (demandeur ou hébergeur)',
  description:
    'Possible sur une demande en attente ou déjà acceptée (annulation bilatérale). ' +
    "L'autre côté est prévenu par email.",
  middleware: [requireAuth, requireAccountType('INDIVIDUAL')] as const,
  request: { params: idParam },
  responses: {
    200: {
      description: 'Demande annulée',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    401: error401,
    403: error403,
    404: error404,
    409: error409,
  },
})

const addMessageRoute = createRoute({
  method: 'post',
  path: '/requests/{id}/messages',
  tags: ['requests'],
  summary: 'Écrire dans le fil d’une demande en attente',
  description:
    'Question de l’hébergeur ou réponse du demandeur. Chaque message remet le délai ' +
    'de 7 jours à zéro et passe la main à l’autre côté (prévenu par email).',
  middleware: [requireAuth, requireAccountType('INDIVIDUAL')] as const,
  request: {
    params: idParam,
    body: {
      content: { 'application/json': { schema: RequestMessageCreateSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Message ajouté',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    400: error400,
    401: error401,
    403: error403,
    404: error404,
    409: error409,
  },
})

export const requestsRouter = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(createRequestRoute, async (c) => {
    assertWithinLimit(requestIpLimiter, `req:ip:${clientIp(c)}`)
    await createRequest(getDb(), c.get('user'), c.req.valid('param').id, c.req.valid('json'))
    return c.json(OkResponseSchema.parse({ ok: true }), 201)
  })
  .openapi(myRequestsRoute, async (c) => {
    const response = await listMyRequests(getDb(), c.get('user').id)
    return c.json(MyRequestsResponseSchema.parse(response), 200)
  })
  .openapi(receivedRequestsRoute, async (c) => {
    const response = await listReceivedRequests(getDb(), c.get('user').id)
    return c.json(ReceivedRequestsResponseSchema.parse(response), 200)
  })
  .openapi(acceptRequestRoute, async (c) => {
    await acceptRequest(getDb(), c.get('user'), c.req.valid('param').id)
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  })
  .openapi(declineRequestRoute, async (c) => {
    await declineRequest(getDb(), c.get('user'), c.req.valid('param').id)
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  })
  .openapi(cancelRequestRoute, async (c) => {
    await cancelRequest(getDb(), c.get('user'), c.req.valid('param').id)
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  })
  .openapi(addMessageRoute, async (c) => {
    await addMessage(getDb(), c.get('user'), c.req.valid('param').id, c.req.valid('json').body)
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  })

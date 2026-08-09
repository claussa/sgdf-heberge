import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  ErrorResponseSchema,
  JumelageAdSchema,
  JumelageAdsResponseSchema,
  JumelageAdUpsertSchema,
  JumelageContactCreateSchema,
  JumelageKindSchema,
  MyJumelageAdSchema,
  MyJumelageResponseSchema,
  OkResponseSchema,
  SiteSchema,
} from '@repo/contracts'
import { getDb } from '../lib/prisma'
import { type AuthVariables, requireAccountType, requireAuth } from '../middleware/auth'
import { assertWithinLimit, clientIp, RateLimiter } from '../middleware/rate-limit'
import {
  acceptContact,
  createContact,
  dismissContact,
  getAd,
  getMyJumelage,
  listAds,
  upsertMyAd,
  withdrawMyAd,
} from '../services/jumelage-service'

/**
 * Routes jumelage (écrans A.13-A.16) — réservées aux unités scoutes onboardées
 * (cloisonnement des parcours : un particulier n'accueille pas d'unité).
 */

/** Anti-spam sur la création de demandes de mise en relation, par IP (plan v1). */
export const contactLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 20 })

// Le tuple middleware est répété inline dans chaque createRoute : c'est ce qui
// permet à @hono/zod-openapi d'inférer les Variables (un tableau partagé readonly
// casse l'inférence générique — et donc le typage de c.req.valid).
const requireScoutUnit = requireAccountType('SCOUT_UNIT')

const error401 = {
  description: 'Non authentifié',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}
const error403 = {
  description: 'Réservé aux unités scoutes',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}
const error404 = {
  description: 'Introuvable',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}

const idParam = z.object({ id: z.string().min(1) })

const listAdsRoute = createRoute({
  method: 'get',
  path: '/jumelage/ads',
  tags: ['jumelage'],
  summary: 'Annonces de jumelage actives',
  description:
    'Cartes publiques (unité, branche, effectif, dates) — jamais de coordonnées. ' +
    'La propre annonce du compte est exclue de la liste.',
  middleware: [requireAuth, requireScoutUnit] as const,
  request: {
    query: z.object({
      site: SiteSchema.optional(),
      kind: JumelageKindSchema.optional(),
    }),
  },
  responses: {
    200: {
      description: 'Annonces actives',
      content: { 'application/json': { schema: JumelageAdsResponseSchema } },
    },
    401: error401,
    403: error403,
  },
})

const getAdRoute = createRoute({
  method: 'get',
  path: '/jumelage/ads/{id}',
  tags: ['jumelage'],
  summary: "Fiche d'une annonce",
  middleware: [requireAuth, requireScoutUnit] as const,
  request: { params: idParam },
  responses: {
    200: {
      description: 'Annonce',
      content: { 'application/json': { schema: JumelageAdSchema } },
    },
    401: error401,
    403: error403,
    404: error404,
  },
})

const upsertMyAdRoute = createRoute({
  method: 'put',
  path: '/my/jumelage/ad',
  tags: ['jumelage'],
  summary: 'Publier ou modifier notre annonce (une seule annonce active par unité)',
  middleware: [requireAuth, requireScoutUnit] as const,
  request: {
    body: { content: { 'application/json': { schema: JumelageAdUpsertSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Annonce publiée ou mise à jour',
      content: { 'application/json': { schema: MyJumelageAdSchema } },
    },
    400: {
      description: 'Dates invalides',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: error401,
    403: error403,
  },
})

const withdrawMyAdRoute = createRoute({
  method: 'post',
  path: '/my/jumelage/ad/withdraw',
  tags: ['jumelage'],
  summary: 'Retirer notre annonce',
  description:
    'La seule porte de sortie du jumelage (ni refus ni expiration). Les mises en ' +
    'relation déjà acceptées restent acquises.',
  middleware: [requireAuth, requireScoutUnit] as const,
  responses: {
    200: {
      description: 'Annonce retirée',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    401: error401,
    403: error403,
    404: error404,
  },
})

const createContactRoute = createRoute({
  method: 'post',
  path: '/jumelage/ads/{id}/contacts',
  tags: ['jumelage'],
  summary: 'Demander une mise en relation',
  description:
    "Si l'unité accepte, chacune reçoit l'e-mail et le téléphone de l'autre. Une " +
    'demande non acceptée reste simplement sans suite : ni refus, ni expiration.',
  middleware: [requireAuth, requireScoutUnit] as const,
  request: {
    params: idParam,
    body: {
      content: { 'application/json': { schema: JumelageContactCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Demande envoyée',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    401: error401,
    403: error403,
    404: error404,
    409: {
      description: 'Demande déjà envoyée',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    429: {
      description: 'Trop de demandes',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const acceptContactRoute = createRoute({
  method: 'post',
  path: '/jumelage/contacts/{id}/accept',
  tags: ['jumelage'],
  summary: 'Accepter et échanger nos contacts',
  description:
    'Réservé au propriétaire de l’annonce. Les deux unités reçoivent par e-mail le ' +
    'nom du responsable, l’e-mail et le téléphone de l’autre. Multi-jumelage possible.',
  middleware: [requireAuth, requireScoutUnit] as const,
  request: { params: idParam },
  responses: {
    200: {
      description: 'Mise en relation acceptée',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    401: error401,
    403: error403,
    404: error404,
    409: {
      description: 'Demande déjà acceptée',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const dismissContactRoute = createRoute({
  method: 'post',
  path: '/jumelage/contacts/{id}/dismiss',
  tags: ['jumelage'],
  summary: 'Ignorer une demande',
  description:
    'Masque la demande de l’onglet Reçues, sans la refuser et sans notifier le ' +
    'demandeur (silencieux, décision maquette).',
  middleware: [requireAuth, requireScoutUnit] as const,
  request: { params: idParam },
  responses: {
    200: {
      description: 'Demande ignorée',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    401: error401,
    403: error403,
    404: error404,
  },
})

const myJumelageRoute = createRoute({
  method: 'get',
  path: '/my/jumelage',
  tags: ['jumelage'],
  summary: 'Notre espace jumelage (annonce, demandes reçues, mises en relation)',
  description:
    'Les coordonnées (nom du responsable, e-mail, téléphone) n’apparaissent QUE sur ' +
    'les demandes acceptées et les mises en relation.',
  middleware: [requireAuth, requireScoutUnit] as const,
  responses: {
    200: {
      description: 'Espace jumelage',
      content: { 'application/json': { schema: MyJumelageResponseSchema } },
    },
    401: error401,
    403: error403,
  },
})

export const jumelageRouter = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(listAdsRoute, async (c) => {
    const { site, kind } = c.req.valid('query')
    const result = await listAds(getDb(), c.get('user'), { site, kind })
    return c.json(JumelageAdsResponseSchema.parse(result), 200)
  })
  .openapi(getAdRoute, async (c) => {
    const ad = await getAd(getDb(), c.get('user'), c.req.valid('param').id)
    return c.json(JumelageAdSchema.parse(ad), 200)
  })
  .openapi(upsertMyAdRoute, async (c) => {
    const ad = await upsertMyAd(getDb(), c.get('user'), c.req.valid('json'))
    return c.json(MyJumelageAdSchema.parse(ad), 200)
  })
  .openapi(withdrawMyAdRoute, async (c) => {
    await withdrawMyAd(getDb(), c.get('user'))
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  })
  .openapi(createContactRoute, async (c) => {
    assertWithinLimit(contactLimiter, `jc:ip:${clientIp(c)}`)
    const { message } = c.req.valid('json')
    await createContact(getDb(), c.get('user'), c.req.valid('param').id, message ?? null)
    return c.json(OkResponseSchema.parse({ ok: true }), 201)
  })
  .openapi(acceptContactRoute, async (c) => {
    await acceptContact(getDb(), c.get('user'), c.req.valid('param').id)
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  })
  .openapi(dismissContactRoute, async (c) => {
    await dismissContact(getDb(), c.get('user'), c.req.valid('param').id)
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  })
  .openapi(myJumelageRoute, async (c) => {
    const result = await getMyJumelage(getDb(), c.get('user'))
    return c.json(MyJumelageResponseSchema.parse(result), 200)
  })

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  ErrorResponseSchema,
  MemberCreateSchema,
  MemberExportSchema,
  MemberListQuerySchema,
  MemberListResponseSchema,
  MemberSchema,
  MemberUpdateSchema,
  OkResponseSchema,
} from '@repo/contracts'
import { deleteMemberData, exportMemberData } from '@repo/db'
import { AppError } from '../errors'
import { getDb } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { createMember, getMember, listMembers, updateMember } from '../services/member-service'

const IdParamSchema = z.object({ id: z.string().min(1) })

const error401 = {
  description: 'Non authentifié',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}
const error404 = {
  description: 'Adhérent introuvable',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}

const listRoute = createRoute({
  method: 'get',
  path: '/members',
  tags: ['adhérents'],
  summary: 'Lister les adhérents (back-office)',
  middleware: [requireAuth] as const,
  request: { query: MemberListQuerySchema },
  responses: {
    200: {
      description: 'Liste paginée',
      content: { 'application/json': { schema: MemberListResponseSchema } },
    },
    401: error401,
  },
})

const getRoute = createRoute({
  method: 'get',
  path: '/members/{id}',
  tags: ['adhérents'],
  summary: 'Consulter un adhérent',
  middleware: [requireAuth] as const,
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Adhérent',
      content: { 'application/json': { schema: MemberSchema } },
    },
    401: error401,
    404: error404,
  },
})

const createRouteDef = createRoute({
  method: 'post',
  path: '/members',
  tags: ['adhérents'],
  summary: 'Créer un adhérent',
  middleware: [requireAuth] as const,
  request: {
    body: { content: { 'application/json': { schema: MemberCreateSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'Adhérent créé',
      content: { 'application/json': { schema: MemberSchema } },
    },
    401: error401,
    409: {
      description: 'Email déjà enregistré',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/members/{id}',
  tags: ['adhérents'],
  summary: 'Modifier un adhérent',
  middleware: [requireAuth] as const,
  request: {
    params: IdParamSchema,
    body: { content: { 'application/json': { schema: MemberUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Adhérent mis à jour',
      content: { 'application/json': { schema: MemberSchema } },
    },
    401: error401,
    404: error404,
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/members/{id}',
  tags: ['adhérents'],
  summary: 'Effacer un adhérent (RGPD art. 17)',
  description:
    'Effacement en une seule opération : sessions, magic links et journaux sont ' +
    'supprimés en cascade.',
  middleware: [requireAuth] as const,
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Données effacées',
      content: { 'application/json': { schema: OkResponseSchema } },
    },
    401: error401,
    404: error404,
  },
})

const exportRoute = createRoute({
  method: 'get',
  path: '/members/{id}/export',
  tags: ['adhérents'],
  summary: 'Exporter les données d’un adhérent (RGPD art. 20)',
  middleware: [requireAuth] as const,
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Export complet, format portable',
      content: { 'application/json': { schema: MemberExportSchema } },
    },
    401: error401,
    404: error404,
  },
})

export const membersRouter = new OpenAPIHono()
  .openapi(listRoute, async (c) => {
    const query = c.req.valid('query')
    const result = await listMembers(getDb(), query)
    return c.json(MemberListResponseSchema.parse(result), 200)
  })
  .openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param')
    const member = await getMember(getDb(), id)
    if (!member) throw new AppError('NOT_FOUND', 'Adhérent introuvable')
    return c.json(MemberSchema.parse(member), 200)
  })
  .openapi(createRouteDef, async (c) => {
    const input = c.req.valid('json')
    const member = await createMember(getDb(), input)
    return c.json(MemberSchema.parse(member), 201)
  })
  .openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param')
    const input = c.req.valid('json')
    const member = await updateMember(getDb(), id, input)
    return c.json(MemberSchema.parse(member), 200)
  })
  .openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid('param')
    await deleteMemberData(getDb(), id)
    return c.json(OkResponseSchema.parse({ ok: true }), 200)
  })
  .openapi(exportRoute, async (c) => {
    const { id } = c.req.valid('param')
    const data = await exportMemberData(getDb(), id)
    const serialized = {
      ...data,
      member: {
        ...data.member,
        createdAt: data.member.createdAt.toISOString(),
        updatedAt: data.member.updatedAt.toISOString(),
        sessions: data.member.sessions.map((s) => ({
          id: s.id,
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
        })),
      },
    }
    return c.json(MemberExportSchema.parse(serialized), 200)
  })

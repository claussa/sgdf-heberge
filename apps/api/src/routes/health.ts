import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { HealthResponseSchema } from '@repo/contracts'

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['santé'],
  summary: "État de l'API",
  responses: {
    200: {
      description: 'API opérationnelle',
      content: { 'application/json': { schema: HealthResponseSchema } },
    },
  },
})

export const healthRouter = new OpenAPIHono().openapi(healthRoute, (c) => {
  return c.json(HealthResponseSchema.parse({ status: 'ok' }), 200)
})

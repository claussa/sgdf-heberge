import { OpenAPIHono } from '@hono/zod-openapi'
import type { AuthVariables } from '../middleware/auth'

// Router en cours de construction — branché dans app.ts, rempli par la suite.
export const adminRouter = new OpenAPIHono<{ Variables: AuthVariables }>()

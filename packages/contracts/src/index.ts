/**
 * Schémas Zod partagés API ↔ SPA (§4).
 * Ce package ne dépend de RIEN d'autre que Zod : c'est le point de contact front/back.
 *
 * Règle de minimisation (§5) : chaque schéma de réponse est la liste exhaustive des
 * champs autorisés à sortir. Tout `c.json()` doit être précédé d'un `Schema.parse()`.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Erreurs — format unique, déclaré dans le spec OpenAPI (§5)
// ---------------------------------------------------------------------------

export const ErrorCode = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
])
export type ErrorCode = z.infer<typeof ErrorCode>

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
  }),
})
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

// ---------------------------------------------------------------------------
// Adhérents
// ---------------------------------------------------------------------------

export const EmailStatusSchema = z.enum(['OK', 'BOUNCED', 'COMPLAINED'])

/** DTO public d'un adhérent — liste EXHAUSTIVE des champs exposables. */
export const MemberSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  birthDate: z.iso.date().nullable(),
  emailStatus: EmailStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Member = z.infer<typeof MemberSchema>

export const MemberCreateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.email().max(320),
  phone: z.string().min(6).max(20).nullish(),
  address: z.string().max(500).nullish(),
  birthDate: z.iso.date().nullish(),
})
export type MemberCreate = z.infer<typeof MemberCreateSchema>

export const MemberUpdateSchema = MemberCreateSchema.partial()
export type MemberUpdate = z.infer<typeof MemberUpdateSchema>

export const MemberListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  /** Recherche « commence par » sur lastName (en clair, §6) */
  search: z.string().max(100).optional(),
})
export type MemberListQuery = z.infer<typeof MemberListQuerySchema>

export const MemberListResponseSchema = z.object({
  items: z.array(MemberSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})
export type MemberListResponse = z.infer<typeof MemberListResponseSchema>

/** Export art. 20 — portabilité. Contient les PII déchiffrées : réservé au titulaire. */
export const MemberExportSchema = z.object({
  format: z.literal('adherents/member-export'),
  version: z.literal(1),
  member: MemberSchema.omit({ emailStatus: true }).extend({
    emailStatus: EmailStatusSchema,
    sessions: z.array(
      z.object({
        id: z.string(),
        createdAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
      }),
    ),
  }),
})
export type MemberExport = z.infer<typeof MemberExportSchema>

export const OkResponseSchema = z.object({ ok: z.literal(true) })

// ---------------------------------------------------------------------------
// Authentification — magic link (§9)
// ---------------------------------------------------------------------------

export const MagicLinkRequestSchema = z.object({
  email: z.email().max(320),
})
export type MagicLinkRequest = z.infer<typeof MagicLinkRequestSchema>

/**
 * Réponse STRICTEMENT identique que l'email existe ou non (anti-énumération, §9).
 * Ne jamais enrichir ce schéma avec une information dépendant de l'existence du compte.
 */
export const MagicLinkRequestResponseSchema = z.object({
  ok: z.literal(true),
  message: z.literal('Si un compte existe pour cette adresse, un lien de connexion a été envoyé.'),
})

// ---------------------------------------------------------------------------
// Santé
// ---------------------------------------------------------------------------

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
})

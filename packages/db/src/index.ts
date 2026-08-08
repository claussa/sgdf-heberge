export type { EmailStatus, MagicLinkToken, MagicLinkUsage, Member, Session } from '@prisma/client'
// Réexports pour que les consommateurs (apps/api) n'importent jamais @prisma/client directement.
export { Prisma } from '@prisma/client'
export { type CreateClientOptions, createPrismaClient, type Db, getPrisma } from './client'
export { deleteMemberData, exportMemberData } from './gdpr'
export { normalizeEmail } from './normalize'

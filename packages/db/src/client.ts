import { Prisma, PrismaClient } from '@prisma/client'
import { fieldEncryptionExtension } from 'prisma-field-encryption'

export interface CreateClientOptions {
  /** Prioritaire sur env DATABASE_URL (tests d'intégration) */
  databaseUrl?: string
  /** Prioritaire sur env PRISMA_FIELD_ENCRYPTION_KEY */
  encryptionKey?: string
  /** Clés de déchiffrement supplémentaires pour la rotation (§6) */
  decryptionKeys?: string[]
}

/**
 * Fabrique un client Prisma avec l'extension de chiffrement au niveau champ.
 * ⚠️ PRISMA_FIELD_ENCRYPTION_HASH_SALT doit être posé dans l'env AVANT cet appel :
 * le sel du blind index est lu au moment de la création de l'extension.
 */
export function createPrismaClient(options: CreateClientOptions = {}) {
  const client = new PrismaClient({
    ...(options.databaseUrl ? { datasourceUrl: options.databaseUrl } : {}),
    // §7 — jamais log: ['query'] : les paramètres liés contiennent les PII en clair.
    log: ['warn', 'error'],
  })
  return client.$extends(
    fieldEncryptionExtension({
      dmmf: Prisma.dmmf,
      encryptionKey: options.encryptionKey,
      decryptionKeys: options.decryptionKeys,
    }),
  )
}

export type Db = ReturnType<typeof createPrismaClient>

let singleton: Db | undefined

/** Singleton au niveau module (§5). Un PrismaClient créé dans un handler est un bug. */
export function getPrisma(): Db {
  singleton ??= createPrismaClient()
  return singleton
}

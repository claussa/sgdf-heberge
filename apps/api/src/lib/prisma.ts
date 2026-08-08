import { type Db, getPrisma } from '@repo/db'

let db: Db | undefined

/** Singleton au niveau module (§5). */
export function getDb(): Db {
  db ??= getPrisma()
  return db
}

/** Réservé aux tests d'intégration : injecte un client pointant vers Testcontainers. */
export function setDb(next: Db): void {
  db = next
}

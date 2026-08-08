/**
 * Normalisation d'email AVANT écriture et lookup.
 * Doit rester alignée avec l'annotation du blind index dans schema.prisma :
 * `@encryption:hash(email)?normalize=lowercase&normalize=trim`
 */
export function normalizeEmail(input: string): string {
  return input.toLowerCase().trim()
}

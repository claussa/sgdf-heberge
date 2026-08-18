/** Dates civiles (ISO `YYYY-MM-DD`) manipulées en heure locale — jamais via
 * `new Date('YYYY-MM-DD')`, qui parse en UTC et décale d'un jour à l'ouest de Greenwich. */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** ISO → Date locale à minuit. `undefined` si la chaîne n'est pas une date ISO. */
export function parseIsoLocal(iso: string): Date | undefined {
  const m = ISO_DATE.exec(iso)
  if (!m) return undefined
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Date locale → ISO `YYYY-MM-DD`. */
export function toIsoLocal(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Une date depuis l'URL, bornée à la fenêtre de l'événement : ISO valide ET
 * `min ≤ v ≤ max` (comparaison lexicographique, correcte pour l'ISO), sinon défaut.
 * Rejette notamment les années partielles (`0005-02-05`) qu'une saisie clavier
 * dans un input date natif laissait passer.
 */
export function dateParamBorne(
  parametres: URLSearchParams,
  cle: string,
  defaut: string,
  min: string,
  max: string,
): string {
  const valeur = parametres.get(cle)
  return valeur !== null && ISO_DATE.test(valeur) && min <= valeur && valeur <= max
    ? valeur
    : defaut
}

/**
 * Résolution des assets nommés par eventConfig.assets (logos, papier déchiré, favicon).
 * Les fichiers vivent dans src/assets/ ; le glob laisse Vite les fingerprinter
 * tout en gardant la config événement comme seule source des noms.
 */
const files = import.meta.glob('../assets/*.{png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export function assetUrl(name: string): string {
  const url = files[`../assets/${name}`]
  if (!url) throw new Error(`Asset introuvable : ${name}`)
  return url
}

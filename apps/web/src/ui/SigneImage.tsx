import { cx } from './cx'

const signes = import.meta.glob('../assets/signes/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** Les 7 signes de la charte — seule iconographie autorisée (ni emoji, ni lib d'icônes). */
export type SigneName = 'fleche' | 'tente' | 'etoile' | 'campement' | 'paix' | 'soleil' | 'promesse'

type SigneImageProps = {
  name: SigneName
  /** Hauteur en px (22 nav mobile, 24-30 vignettes, 44-64 médias) */
  size?: number
  /** 1 par défaut ; 0.45 en substitut de photo sur fond #ebeff2 */
  opacity?: number
  className?: string
}

/** Signe PNG décoratif (alt vide). */
export function SigneImage({ name, size = 22, opacity = 1, className }: SigneImageProps) {
  return (
    <img
      src={signes[`../assets/signes/${name}.png`]}
      alt=""
      height={size}
      style={opacity === 1 ? undefined : { opacity }}
      className={cx('signe', className)}
    />
  )
}

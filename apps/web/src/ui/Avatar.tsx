import { cx } from './cx'

/** « Marie Lefèvre » → « ML », « 1re Nancy » → « 1N », un seul mot → première lettre. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
}

type AvatarProps = {
  /** Nom affiché (initiales calculées) — vide si absent */
  name?: string | null
  /** Côté du carré en px (32 mobile, 34 header, 44 cartes) */
  size?: number
  className?: string
}

/** Carré (jamais rond) fond #ebeff2, initiales 800. */
export function Avatar({ name, size = 34, className }: AvatarProps) {
  const fontSize = size >= 44 ? 13 : size >= 34 ? 12 : 11
  return (
    <span
      className={cx('avatar', className)}
      style={{ width: size, height: size, fontSize }}
      aria-hidden="true"
    >
      {name ? initialsOf(name) : ''}
    </span>
  )
}

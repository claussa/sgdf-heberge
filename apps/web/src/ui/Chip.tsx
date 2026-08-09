import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  active?: boolean
}

/** Pastille cliquable (filtres, Libre/Complet). Actif = fond bleu, texte blanc. */
export function Chip({ active = false, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx('chip', active && 'chip--active', className)}
      {...rest}
    />
  )
}

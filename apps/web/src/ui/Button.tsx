import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary : aplat bleu (CTA) · secondary : contour 1.5px */
  variant?: 'primary' | 'secondary'
  /** md : 46px primary / 42px secondary · sm : 40px / 38px (boutons de carte) */
  size?: 'md' | 'sm'
  /** Pleine largeur (ex. formulaire de connexion) */
  block?: boolean
}

/** `type` vaut « button » par défaut — passer `type="submit"` explicitement dans les formulaires. */
export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cx(
        'btn',
        `btn--${variant}`,
        size === 'sm' && 'btn--sm',
        block && 'btn--block',
        className,
      )}
      {...rest}
    />
  )
}

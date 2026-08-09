import type { HTMLAttributes } from 'react'
import { cx } from './cx'

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Bord supérieur 6px : brand #003a5d · success #007254 · warning #ff8300 (C.4) */
  accentTop?: 'brand' | 'success' | 'warning'
}

/** Carte blanche bordée hairline, padding 16px (surchargable par className). */
export function Card({ accentTop, className, ...rest }: CardProps) {
  return (
    <div className={cx('card', accentTop && `card--accent-${accentTop}`, className)} {...rest} />
  )
}

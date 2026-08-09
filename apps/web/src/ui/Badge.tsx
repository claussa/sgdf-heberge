import type { ReactNode } from 'react'
import { cx } from './cx'

type BadgeProps = {
  /** neutral 400 bleu · success 700 vert · danger 700 rouge · warning bord orange, texte bleu */
  variant?: 'neutral' | 'success' | 'danger' | 'warning'
  children: ReactNode
  className?: string
}

/** Badge contour, jamais de fond, jamais de radius (C.3). */
export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span className={cx('badge', variant !== 'neutral' && `badge--${variant}`, className)}>
      {children}
    </span>
  )
}

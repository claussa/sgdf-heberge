import type { ReactNode } from 'react'
import { cx } from './cx'

/** Carte succès : bord supérieur 6px #007254, fade à l'apparition. */
export function SuccessPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('success-panel', className)}>{children}</div>
}

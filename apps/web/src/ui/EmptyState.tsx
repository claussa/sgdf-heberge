import type { ReactNode } from 'react'
import { cx } from './cx'

/** État vide sobre : texte 14px #66899e (ex. « Aucune demande refusée. »). */
export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('empty-state', className)}>{children}</p>
}

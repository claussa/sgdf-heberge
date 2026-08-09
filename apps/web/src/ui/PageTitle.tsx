import type { ReactNode } from 'react'
import { cx } from './cx'

/**
 * Titre d'écran — Caveat Brush 36px. Signature de la charte : le texte FINIT par
 * une virgule (« Mes demandes, »), sauf les titres interrogatifs.
 */
export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cx('page-title', className)}>{children}</h1>
}

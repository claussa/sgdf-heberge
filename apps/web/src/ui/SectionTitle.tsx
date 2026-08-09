import type { ReactNode } from 'react'
import { cx } from './cx'

/** Sous-titre de section — Caveat Brush 24px (ex. « Mes couchages, »). */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx('section-title', className)}>{children}</h2>
}

import type { ReactNode } from 'react'
import { cx } from './cx'

/** Note d'aide 13px #66899e sous les blocs (interligne 1.5). */
export function HelpText({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('help-text', className)}>{children}</p>
}

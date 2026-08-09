import type { InputHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Peut contenir du gras : <>Nous <b>cherchons</b> un jumelage sur place</> */
  label: ReactNode
}

/** Rond 18px bordé 1.5px ; coché = disque 9px. Grouper via la prop `name`. */
export function Radio({ label, className, ...rest }: RadioProps) {
  return (
    <label className={cx('radio', className)}>
      <input type="radio" className="radio__input" {...rest} />
      <span className="radio__box" aria-hidden="true" />
      <span className="radio__label">{label}</span>
    </label>
  )
}

import type { InputHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Peut contenir du gras : <><b>Libellé</b> — précision</> */
  label: ReactNode
}

/** Carré 18px bordé 1.5px ; coché = carré plein 10px (pas de coche). */
export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label className={cx('checkbox', className)}>
      <input type="checkbox" className="checkbox__input" {...rest} />
      <span className="checkbox__box" aria-hidden="true" />
      <span className="checkbox__label">{label}</span>
    </label>
  )
}

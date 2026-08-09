import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cx } from './cx'

type FieldProps = {
  /** Libellé 700 11px uppercase #33627d */
  label: string
  /** Glose ajoutée au libellé après « — » (ex. « déjà connu par la connexion ») */
  glose?: string
  children: ReactNode
  className?: string
}

/** Label + contrôle unique (input, select, textarea ou paire accolée). */
export function Field({ label, glose, children, className }: FieldProps) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: le contrôle est toujours passé en children (association implicite)
    <label className={cx('field', className)}>
      <span className="field__label">
        {label}
        {glose ? ` — ${glose}` : ''}
      </span>
      {children}
    </label>
  )
}

/** Variante groupe (checkboxes, radios) : rend un div — pas de labels imbriqués. */
export function FieldGroup({ label, glose, children, className }: FieldProps) {
  return (
    <div className={cx('field', 'field--group', className)}>
      <span className="field__label">
        {label}
        {glose ? ` — ${glose}` : ''}
      </span>
      {children}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** md : 42px · lg : 44px (connexion) · sm : 36px (tableaux) · xs : 34px (filtres) */
  uiSize?: 'md' | 'lg' | 'sm' | 'xs'
}

export function Input({ uiSize = 'md', className, ...rest }: InputProps) {
  return (
    <input className={cx('input', uiSize !== 'md' && `input--${uiSize}`, className)} {...rest} />
  )
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** Classe du conteneur (celui qui porte le chevron ▾) */
  wrapClassName?: string
}

export function Select({ wrapClassName, className, children, ...rest }: SelectProps) {
  return (
    <span className={cx('select-wrap', wrapClassName)}>
      <select className={cx('select', className)} {...rest}>
        {children}
      </select>
    </span>
  )
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** md : 80px · sm : 64px · lg : 88px de min-height */
  uiSize?: 'md' | 'sm' | 'lg'
}

export function Textarea({ uiSize = 'md', className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cx('textarea', uiSize !== 'md' && `textarea--${uiSize}`, className)}
      {...rest}
    />
  )
}

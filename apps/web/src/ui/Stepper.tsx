import { cx } from './cx'

type StepperProps = {
  /** Étape courante (1-indexée) */
  step: number
  total?: number
  className?: string
}

/** Carrés 10px (courant orange, autres #ccd7df) + « Étape N sur M ». */
export function Stepper({ step, total = 2, className }: StepperProps) {
  const steps = Array.from({ length: total }, (_, index) => index + 1)
  return (
    <div className={cx('stepper', className)}>
      {steps.map((n) => (
        <span key={n} className={cx('stepper__square', n === step && 'stepper__square--active')} />
      ))}
      <span className="stepper__label">
        Étape {step} sur {total}
      </span>
    </div>
  )
}

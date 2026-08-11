import type { ParkingEase } from '@repo/contracts'
import { cx } from './cx'

export const PARKING_EASE_LABELS: Record<ParkingEase, string> = {
  EASY: 'Facile',
  MEDIUM: 'Moyen',
  HARD: 'Difficile',
}

/** Barres remplies : facile = 3/3, moyen = 2/3, difficile = 1/3. */
const FILLED: Record<ParkingEase, number> = { EASY: 3, MEDIUM: 2, HARD: 1 }

/**
 * Jauge de stationnement : 3 barres verticales, remplissage et couleur selon la
 * facilité (vert/orange/rouge). Décorative — toujours accompagnée du libellé texte.
 */
export function ParkingGauge({ ease, className }: { ease: ParkingEase; className?: string }) {
  const filled = FILLED[ease]
  return (
    <span
      className={cx('parking-gauge', `parking-gauge--${ease.toLowerCase()}`, className)}
      aria-hidden="true"
    >
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={cx('parking-gauge__bar', bar <= filled && 'parking-gauge__bar--filled')}
          style={{ height: 4 + bar * 3 }}
        />
      ))}
    </span>
  )
}

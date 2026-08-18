import { formatDateRangeShort } from '@repo/event-config'
import { useEffect, useRef, useState } from 'react'
import { type DateRange, DayPicker } from 'react-day-picker'
import { fr } from 'react-day-picker/locale'
import { parseIsoLocal, toIsoLocal } from '../lib/dates'
import { cx } from './cx'
import 'react-day-picker/style.css'
import './date-range-picker.css'

type DateRangePickerProps = {
  /** Bornes courantes, ISO `YYYY-MM-DD` complets */
  from: string
  to: string
  /** Appelé uniquement avec un intervalle complet — jamais de valeur partielle */
  onChange: (range: { from: string; to: string }) => void
  /** Fenêtre sélectionnable (eventConfig.dates.inputMin / inputMax) */
  min: string
  max: string
  /** md : formulaires (42px) · xs : barre de filtres (34px) */
  uiSize?: 'md' | 'xs'
  className?: string
  ariaLabel?: string
  disabled?: boolean
}

/**
 * Sélecteur d'intervalle de dates : bouton au look champ + popover calendrier.
 * Les clics intermédiaires restent en brouillon interne ; le popover se ferme
 * et `onChange` ne part qu'une fois arrivée ET départ choisis.
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  min,
  max,
  uiSize = 'md',
  className,
  ariaLabel = 'Dates',
  disabled,
}: DateRangePickerProps) {
  const [ouvert, setOuvert] = useState(false)
  const [brouillon, setBrouillon] = useState<DateRange | undefined>()
  const conteneurRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const basculer = () => {
    if (!ouvert) setBrouillon({ from: parseIsoLocal(from), to: parseIsoLocal(to) })
    setOuvert(!ouvert)
  }

  const fermerEtRefocus = () => {
    setOuvert(false)
    triggerRef.current?.focus()
  }

  const commettre = (debut: Date, fin: Date) => {
    onChange({ from: toIsoLocal(debut), to: toIsoLocal(fin) })
    fermerEtRefocus()
  }

  // Avec `resetOnSelect`, le 1er clic sur un range complet repart de zéro ({from, to: undefined}) ;
  // le 2e clic sur un autre jour complète le range → commit. Avec `min={1}` (au moins une
  // nuit), re-cliquer le même jour désélectionne au lieu de créer un séjour d'un jour.
  const surSelection = (suivant: DateRange | undefined) => {
    if (suivant?.from && suivant.to) commettre(suivant.from, suivant.to)
    else setBrouillon(suivant)
  }

  // Fermeture au clic extérieur (sans voler le focus)
  useEffect(() => {
    if (!ouvert) return
    const surPointerDown = (event: PointerEvent) => {
      if (!conteneurRef.current?.contains(event.target as Node)) setOuvert(false)
    }
    document.addEventListener('pointerdown', surPointerDown)
    return () => document.removeEventListener('pointerdown', surPointerDown)
  }, [ouvert])

  return (
    <span className={cx('drp', className)} ref={conteneurRef}>
      <button
        type="button"
        ref={triggerRef}
        className={cx('input', uiSize === 'xs' && 'input--xs', 'drp__trigger')}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={basculer}
      >
        {formatDateRangeShort(from, to)}
      </button>
      {ouvert && (
        <div
          role="dialog"
          aria-label="Choisir les dates"
          className="drp__popover"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              fermerEtRefocus()
            }
          }}
        >
          <DayPicker
            mode="range"
            locale={fr}
            selected={brouillon}
            onSelect={surSelection}
            resetOnSelect
            min={1}
            defaultMonth={parseIsoLocal(from) ?? parseIsoLocal(min)}
            startMonth={parseIsoLocal(min)}
            endMonth={parseIsoLocal(max)}
            disabled={{ before: parseIsoLocal(min) as Date, after: parseIsoLocal(max) as Date }}
            numberOfMonths={1}
            autoFocus
          />
        </div>
      )}
    </span>
  )
}

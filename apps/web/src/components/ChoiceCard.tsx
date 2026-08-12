import { cx } from '../ui'

type ChoiceCardProps = {
  /** Attribut `name` du groupe radio (un groupe par écran). */
  name: string
  selected: boolean
  onSelect: () => void
  title: string
  text: string
}

/** Carte radio (inscription, comment ça marche) : bordure 2px bleue + point plein si choisie. */
export function ChoiceCard({ name, selected, onSelect, title, text }: ChoiceCardProps) {
  return (
    <label className={cx('choice-card', selected && 'choice-card--selected')}>
      <input
        type="radio"
        name={name}
        className="choice-card__input"
        checked={selected}
        onChange={onSelect}
      />
      <span className="choice-card__dot" aria-hidden="true">
        {selected && <span className="choice-card__dot-inner" />}
      </span>
      <span className="choice-card__body">
        <span className="choice-card__title">{title}</span>
        <span className="choice-card__text">{text}</span>
      </span>
    </label>
  )
}

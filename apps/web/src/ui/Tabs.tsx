import { cx } from './cx'

export type TabItem = {
  label: string
  /** Compteur affiché « Label (n) » — omis si absent */
  count?: number
}

type TabsProps = {
  tabs: TabItem[]
  /** Index de l'onglet actif */
  active: number
  onChange: (index: number) => void
  className?: string
}

/** Barre d'onglets scrollable ; actif = texte bleu + trait 3px orange. */
export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cx('tabs', className)} role="tablist">
      {tabs.map((tab, index) => (
        <button
          key={tab.label}
          type="button"
          role="tab"
          aria-selected={index === active}
          className={cx('tabs__tab', index === active && 'tabs__tab--active')}
          onClick={() => onChange(index)}
        >
          {tab.count === undefined ? tab.label : `${tab.label} (${tab.count})`}
        </button>
      ))}
    </div>
  )
}

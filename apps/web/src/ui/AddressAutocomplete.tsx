import { useEffect, useRef, useState } from 'react'
import { Input } from './Field'

/**
 * Autocomplete d'adresse BAN (api-adresse.data.gouv.fr — service public français,
 * pas de clé, RGPD ok). L'adresse est TOUJOURS choisie dans la liste (maquette :
 * « Adresse choisie dans une liste : ville, code postal et distance au site se
 * remplissent seuls ») — la saisie libre ne produit jamais de valeur.
 */
export interface AddressValue {
  label: string
  city: string
  postcode: string
  lat: number
  lng: number
}

interface BanFeature {
  properties: { label: string; city: string; postcode: string }
  geometry: { coordinates: [number, number] }
}

interface AddressAutocompleteProps {
  label: string
  glose?: string
  value: AddressValue | null
  onChange: (value: AddressValue | null) => void
  placeholder?: string
  /** Pré-remplissage du champ en édition (l'adresse stockée), sans valeur sélectionnée */
  initialQuery?: string
}

export function AddressAutocomplete({
  label,
  glose,
  value,
  onChange,
  placeholder,
  initialQuery,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value?.label ?? initialQuery ?? '')
  const [suggestions, setSuggestions] = useState<BanFeature[]>([])
  const [open, setOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const skipNextFetch = useRef(false)

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false
      return
    }
    if (query.trim().length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5&autocomplete=1`,
          { signal: controller.signal },
        )
        if (!res.ok) return
        const data = (await res.json()) as { features?: BanFeature[] }
        setSuggestions(data.features ?? [])
        setOpen((data.features ?? []).length > 0)
      } catch {
        // réseau/abort : le géocodage ne bloque jamais la saisie
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  function select(feature: BanFeature) {
    const [lng, lat] = feature.geometry.coordinates
    skipNextFetch.current = true
    setQuery(feature.properties.label)
    setSuggestions([])
    setOpen(false)
    onChange({
      label: feature.properties.label,
      city: feature.properties.city,
      postcode: feature.properties.postcode,
      lat,
      lng,
    })
  }

  return (
    <div className="field address-ac">
      <span className="field__label">
        {label}
        {glose ? ` — ${glose}` : ''}
      </span>
      <Input
        type="text"
        value={query}
        placeholder={placeholder ?? 'Commence à taper ton adresse…'}
        onChange={(e) => {
          setQuery(e.target.value)
          if (value) onChange(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' && open && suggestions[0]) {
            e.preventDefault()
            select(suggestions[0])
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open ? (
        <ul className="address-ac__list">
          {suggestions.map((s, i) => (
            <li key={s.properties.label}>
              <button
                type="button"
                className={
                  i === 0 ? 'address-ac__item address-ac__item--first' : 'address-ac__item'
                }
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(s)}
              >
                {s.properties.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

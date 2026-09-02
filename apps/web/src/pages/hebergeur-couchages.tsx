import type { MyListing } from '@repo/contracts'
import { Chip, Select } from '../ui'
import { BED_TYPE_LABELS, useBedTakenCount } from './hebergeur-lib'

/**
 * Occupation ligne par ligne d'un logement de particulier (A.8, A.9), sous les chips
 * globales Libre/Complet. Un seul couchage sur une seule ligne n'a rien à régler de
 * plus que le statut global : le bloc n'apparaît qu'avec plusieurs lignes, ou
 * plusieurs couchages sur une ligne (« 2× Chambre privée »).
 */
export function hasBedControls(listing: Pick<MyListing, 'category' | 'beds'>): boolean {
  return (
    listing.category === 'PRIVATE' &&
    (listing.beds.length > 1 || listing.beds.some((bed) => bed.count > 1))
  )
}

/** « 2× Chambre privée · 2 pers. · 1er étage, ascenseur » */
export function bedLineLabel(
  bed: Pick<MyListing['beds'][number], 'type' | 'count' | 'capacityEach' | 'note'>,
): string {
  return [
    `${bed.count}× ${BED_TYPE_LABELS[bed.type]}`,
    `${bed.capacityEach} pers.`,
    ...(bed.note ? [bed.note] : []),
  ].join(' · ')
}

/** « 2 libres sur 2 » / « 1 libre sur 2 » / « 0 libre sur 2 » */
function libresLabel(free: number, count: number): string {
  return `${free} libre${free > 1 ? 's' : ''} sur ${count}`
}

/** Valeurs possibles de « occupés » sur une ligne : 0 … count (la valeur est l'identité de l'option). */
function takenOptions(count: number): number[] {
  return Array.from({ length: count + 1 }, (_, taken) => taken)
}

export function CouchagesDispo({ listing }: { listing: MyListing }) {
  const setTaken = useBedTakenCount()
  if (!hasBedControls(listing)) return null
  const regler = (bedId: string, takenCount: number) =>
    setTaken.mutate({ listingId: listing.id, bedId, takenCount })

  return (
    <div className="couchages-dispo">
      <ul className="couchages-dispo__lignes">
        {listing.beds.map((bed) => (
          <li key={bed.id} className="couchages-dispo__ligne">
            <span className="couchages-dispo__libelle">{bedLineLabel(bed)}</span>
            {bed.count === 1 ? (
              <span className="chips">
                <Chip
                  active={bed.takenCount === 0}
                  disabled={setTaken.isPending}
                  onClick={() => regler(bed.id, 0)}
                >
                  Libre
                </Chip>
                <Chip
                  active={bed.takenCount >= 1}
                  disabled={setTaken.isPending}
                  onClick={() => regler(bed.id, 1)}
                >
                  Occupé
                </Chip>
              </span>
            ) : (
              <Select
                value={String(bed.takenCount)}
                aria-label={`Couchages libres — ${bedLineLabel(bed)}`}
                wrapClassName="couchages-dispo__select"
                disabled={setTaken.isPending}
                onChange={(event) => regler(bed.id, Number(event.target.value))}
              >
                {takenOptions(bed.count).map((taken) => (
                  <option key={taken} value={taken}>
                    {libresLabel(bed.count - taken, bed.count)}
                  </option>
                ))}
              </Select>
            )}
          </li>
        ))}
      </ul>
      {listing.status === 'OPEN' && listing.availableCapacity === 0 && (
        <p className="couchages-dispo__note">
          Tous les couchages sont occupés : le logement n’apparaît plus dans les recherches.
        </p>
      )}
      {setTaken.isError && (
        <p className="alert-text">L’action a échoué. Recharge la page, puis réessaie.</p>
      )}
    </div>
  )
}

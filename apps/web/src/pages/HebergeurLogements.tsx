import { formatDateRangeLong } from '@repo/event-config'
import { useNavigate } from 'react-router'
import { Badge, Button, Card, Chip, HelpText, Loading, PageTitle, SigneImage } from '../ui'
import { countPersonnes, listingSigne, useListingStatus, useMyListings } from './hebergeur-lib'
import './hebergeur.css'

/**
 * /hebergeur/logements — écran A.9 « Mes logements, ». Une carte-ligne par logement
 * (vignette signe, méta, chips Libre/Complet, Modifier), bandeau « Réactiver » si le
 * logement a été masqué pour inactivité (hiddenAt).
 */
export function HebergeurLogements() {
  const navigate = useNavigate()
  const listingsQuery = useMyListings()
  const setStatus = useListingStatus()

  if (listingsQuery.isPending) return <Loading />

  const listings = listingsQuery.data ?? []

  return (
    <div className="logements fade">
      <PageTitle>Mes logements,</PageTitle>
      {listingsQuery.isError && (
        <p className="alert-text">Impossible de charger tes logements. Recharge la page.</p>
      )}
      {listings.length > 0 && (
        <div className="logements__list">
          {listings.map((listing) => (
            <Card key={listing.id} className="logement-row">
              <div className="logement-row__vignette">
                <SigneImage name={listingSigne(listing)} size={30} opacity={0.45} />
              </div>
              <div className="logement-row__body">
                <span className="logement-row__title">{listing.title}</span>
                <span className="logement-row__meta">
                  {listing.displayArea} · {countPersonnes(listing.capacity)} · disponible{' '}
                  {formatDateRangeLong(listing.availableFrom, listing.availableTo)}
                </span>
                {listing.hiddenAt !== null && (
                  <span className="logement-row__hidden">
                    <Badge variant="warning">Masqué — hébergeur inactif</Badge>
                    <Button
                      size="sm"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: listing.id, status: 'OPEN' })}
                    >
                      Réactiver
                    </Button>
                  </span>
                )}
                {listing.pendingRequests > 0 && (
                  <span className="logement-row__badges">
                    <Badge>
                      {listing.pendingRequests === 1
                        ? '1 demande en attente'
                        : `${listing.pendingRequests} demandes en attente`}
                    </Badge>
                  </span>
                )}
              </div>
              <div className="logement-row__actions">
                <span className="chips">
                  <Chip
                    active={listing.status === 'OPEN'}
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: listing.id, status: 'OPEN' })}
                  >
                    Libre
                  </Chip>
                  <Chip
                    active={listing.status === 'FULL'}
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: listing.id, status: 'FULL' })}
                  >
                    Complet
                  </Chip>
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/hebergeur/logements/${listing.id}/modifier`)}
                >
                  Modifier
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {setStatus.isError && (
        <p className="alert-text">L’action a échoué. Recharge la page, puis réessaie.</p>
      )}
      <Button
        variant="secondary"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => navigate('/hebergeur/logements/nouveau')}
      >
        + Ajouter un logement
      </Button>
      <HelpText>
        Tu peux avoir plusieurs logements, et passer chacun en "complet" à tout moment.
      </HelpText>
    </div>
  )
}

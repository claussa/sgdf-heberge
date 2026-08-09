import type { JumelageKind } from '@repo/contracts'
import { eventConfig, formatDateRangeShort, type SiteSlug, siteLabel } from '@repo/event-config'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { api } from '../lib/api'
import { Button, EmptyState, HelpText, Loading, PageTitle, SigneImage, Tabs } from '../ui'
import { JUMELAGE_ADS_KEY, useMyJumelage } from './jumelage-data'
import './jumelage-admin.css'

/**
 * /jumelage — écran A.14. La liste montre les annonces du sens OPPOSÉ au nôtre,
 * sur notre site : une unité qui cherche voit celles qui peuvent jumeler, et
 * inversement. Sans annonce active, l'écran renvoie vers A.13.
 */
export function Jumelage() {
  const navigate = useNavigate()
  const my = useMyJumelage()

  if (my.isPending) return <Loading />
  if (my.isError || !my.data) {
    return (
      <p className="alert-text">Impossible de charger le jumelage. Réessayez dans un instant.</p>
    )
  }

  const ad = my.data.ad
  if (ad?.status !== 'ACTIVE') {
    return (
      <div className="ja-col ja-col--680 fade">
        <EmptyState>Publie d’abord votre annonce,</EmptyState>
        <Button style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/unite/annonce')}>
          Publier notre annonce
        </Button>
      </div>
    )
  }

  return <JumelageList site={ad.site} kind={ad.kind === 'SEEKING' ? 'HOSTING' : 'SEEKING'} />
}

function JumelageList({ site, kind }: { site: SiteSlug; kind: JumelageKind }) {
  const navigate = useNavigate()
  const ads = useQuery({
    queryKey: [...JUMELAGE_ADS_KEY, site, kind],
    queryFn: async () => {
      const res = await api.jumelage.ads.$get({ query: { site, kind } })
      if (res.status === 200) return res.json()
      throw new Error(`GET /jumelage/ads : ${res.status}`)
    },
  })

  return (
    <div className="ja-col ja-col--680 fade">
      <PageTitle>Jumelage à {siteLabel(site)},</PageTitle>
      <Tabs
        tabs={[{ label: 'Unités à jumeler' }, { label: 'Notre annonce' }]}
        active={0}
        onChange={(index) => {
          if (index === 1) navigate('/unite/annonce')
        }}
      />
      {ads.isPending && <Loading />}
      {ads.isError && (
        <p className="alert-text">Impossible de charger les unités. Réessayez dans un instant.</p>
      )}
      {ads.data && (
        <>
          <p className="ja-count">
            <b>
              {ads.data.total} {ads.data.total > 1 ? 'unités' : 'unité'}
            </b>{' '}
            · {siteLabel(site)}, {eventConfig.dates.label}
          </p>
          <div className="ja-unit-list">
            {ads.data.items.map((item) => (
              <Link key={item.id} to={`/jumelage/${item.id}`} className="ja-unit-card">
                <span className="ja-vignette">
                  <SigneImage name="paix" size={24} opacity={0.45} />
                </span>
                <span className="ja-unit-card__body">
                  <span className="ja-unit-card__name">{item.unitName}</span>
                  {item.unitBranch && <span className="ja-unit-card__sub">{item.unitBranch}</span>}
                  <span className="ja-unit-card__sub">
                    {item.kind === 'HOSTING'
                      ? `Peut jumeler jusqu’à ${item.peopleLabel}`
                      : `Nous serons ${item.peopleLabel}`}{' '}
                    · {formatDateRangeShort(item.dateFrom, item.dateTo)}
                  </span>
                </span>
                <span className="ja-unit-card__see">Voir →</span>
              </Link>
            ))}
          </div>
        </>
      )}
      <HelpText>
        La recherche marche dans les deux sens : une unité qui peut jumeler voit la liste des unités
        qui cherchent. Même écran, même bouton.
      </HelpText>
    </div>
  )
}

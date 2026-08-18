import { siteLabel } from '@repo/event-config'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../lib/api'
import { Card, HelpText, Loading, PageTitle, SectionTitle } from '../ui'
import './jumelage-admin.css'

/** Clé des métriques — invalidée par le CRUD des logements institutionnels. */
export const ADMIN_METRICS_KEY = ['admin-metrics'] as const

/**
 * /admin — tableau de bord (hors maquette : sobre, composants charte). Une carte
 * par site avec trois blocs clé-valeur, puis les comptes tous sites confondus.
 */
export function Admin() {
  const metrics = useQuery({
    queryKey: ADMIN_METRICS_KEY,
    queryFn: async () => {
      const res = await api.admin.metrics.$get()
      if (res.status === 200) return res.json()
      throw new Error(`GET /admin/metrics : ${res.status}`)
    },
  })

  if (metrics.isPending) return <Loading />
  if (metrics.isError || !metrics.data) {
    return (
      <p className="alert-text">Impossible de charger les métriques. Réessaie dans un instant.</p>
    )
  }

  const { sites, users } = metrics.data

  return (
    <div className="ja-col ja-col--760 fade">
      <PageTitle>Tableau de bord,</PageTitle>
      <Link to="/admin/logements" className="ja-link">
        Gérer les logements institutionnels →
      </Link>
      <Link to="/admin/administrateurs" className="ja-link">
        Gérer les administrateurs →
      </Link>
      {sites.map((site) => (
        <Card key={site.site} className="ja-card-stack">
          <SectionTitle>{siteLabel(site.site)},</SectionTitle>
          <div className="ja-metrics">
            <MetricBlock
              title="Logements"
              rows={[
                ['Privés actifs', site.listings.privateActive],
                ['Masqués', site.listings.privateHidden],
                ['Hôtels', site.listings.hotel],
                ['Gymnases', site.listings.collective],
                ['Bases scout', site.listings.scoutBase],
                ['Capacité totale', site.listings.totalCapacity],
              ]}
            />
            <MetricBlock
              title="Demandes"
              rows={[
                ['En attente', site.requests.pending],
                ['Acceptées', site.requests.accepted],
                ['Refusées', site.requests.declined],
                ['Expirées', site.requests.expired],
                ['Annulées', site.requests.cancelled],
              ]}
            />
            <MetricBlock
              title="Jumelage"
              rows={[
                ['Cherchent', site.jumelage.seeking],
                ['Accueillent', site.jumelage.hosting],
                ['En relation', site.jumelage.relations],
              ]}
            />
          </div>
        </Card>
      ))}
      <Card className="ja-card-stack">
        <SectionTitle>Comptes,</SectionTitle>
        <div className="ja-metrics">
          <MetricBlock
            rows={[
              ['Volontaires, participants & hébergeurs', users.individuals],
              ['Unités', users.units],
              ['Coquilles', users.shells],
            ]}
          />
        </div>
      </Card>
      <HelpText>Coquilles : lien de connexion demandé, inscription jamais terminée.</HelpText>
    </div>
  )
}

function MetricBlock({ title, rows }: { title?: string; rows: Array<[string, number]> }) {
  return (
    <div className="ja-kv-block">
      {title && <span className="ja-kv-title">{title}</span>}
      <dl className="ja-kv">
        {rows.map(([label, value]) => (
          <div key={label} className="ja-kv__row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

import type { MemberListResponse } from '@repo/contracts'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export function Members() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<MemberListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setError(null)
      try {
        const res = await api.members.$get({
          query: {
            page: String(page),
            pageSize: '20',
            ...(search ? { search } : {}),
          },
        })
        if (!res.ok) {
          setError('Erreur lors du chargement de la liste.')
          return
        }
        const body = await res.json()
        if (!cancelled) setData(body)
      } catch {
        if (!cancelled) setError('Erreur réseau.')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [search, page])

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <section>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Rechercher par nom (commence par…)"
          value={search}
          onChange={(e) => {
            setPage(1)
            setSearch(e.target.value)
          }}
        />
        {data && <span className="muted">{data.total} adhérent·es</span>}
      </div>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Prénom</th>
            <th>Email</th>
            <th>Téléphone</th>
            <th>Statut email</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((m) => (
            <tr key={m.id}>
              <td>{m.lastName}</td>
              <td>{m.firstName}</td>
              <td>{m.email}</td>
              <td>{m.phone ?? '—'}</td>
              <td>{m.emailStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pagination">
        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ← Précédent
        </button>
        <span>
          Page {page} / {pageCount}
        </span>
        <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
          Suivant →
        </button>
      </div>
    </section>
  )
}

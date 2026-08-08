import type { Member } from '@repo/contracts'
import { useCallback, useEffect, useState } from 'react'
import { api } from './lib/api'
import { Login } from './pages/Login'
import { Members } from './pages/Members'

type AuthState = { status: 'loading' } | { status: 'anonymous' } | { status: 'ok'; me: Member }

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })

  const refresh = useCallback(async () => {
    try {
      const res = await api.me.$get()
      if (res.ok) {
        setAuth({ status: 'ok', me: await res.json() })
      } else {
        setAuth({ status: 'anonymous' })
      }
    } catch {
      setAuth({ status: 'anonymous' })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    await api.auth.logout.$post()
    setAuth({ status: 'anonymous' })
  }, [])

  if (auth.status === 'loading') {
    return <main className="centered">Chargement…</main>
  }

  if (auth.status === 'anonymous') {
    return <Login />
  }

  return (
    <main className="layout">
      <header className="topbar">
        <h1>Espace adhérents</h1>
        <div className="topbar-right">
          <span>
            {auth.me.firstName} {auth.me.lastName}
          </span>
          <button type="button" onClick={logout}>
            Se déconnecter
          </button>
        </div>
      </header>
      <Members />
    </main>
  )
}

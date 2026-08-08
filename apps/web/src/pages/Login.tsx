import { type FormEvent, useState } from 'react'
import { api } from '../lib/api'

type State = 'idle' | 'sending' | 'sent' | 'error'

export function Login() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>('idle')

  const linkError = new URLSearchParams(window.location.search).get('error')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setState('sending')
    try {
      const res = await api.auth['magic-link'].$post({ json: { email } })
      setState(res.status === 202 ? 'sent' : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <main className="centered">
      <form className="card" onSubmit={submit}>
        <h1>Connexion</h1>
        {linkError === 'lien-invalide' && (
          <p className="error">
            Ce lien de connexion est expiré ou invalide. Demandez-en un nouveau.
          </p>
        )}
        {state === 'sent' ? (
          <p>
            Si un compte existe pour <strong>{email}</strong>, un lien de connexion vient d'être
            envoyé. Il est valable 10 minutes — pensez à vérifier vos indésirables.
          </p>
        ) : (
          <>
            <p>Saisissez votre adresse email pour recevoir un lien de connexion.</p>
            <label htmlFor="email">Adresse email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom.nom@exemple.org"
            />
            <button type="submit" disabled={state === 'sending'}>
              {state === 'sending' ? 'Envoi…' : 'Recevoir mon lien'}
            </button>
            {state === 'error' && (
              <p className="error">Impossible d'envoyer le lien, réessayez dans un instant.</p>
            )}
          </>
        )}
      </form>
    </main>
  )
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminLogements } from '../src/pages/AdminLogements'

/**
 * Régression PostHog 01a024db : « .omit() cannot be used on object schemas
 * containing refinements » — le formulaire crashait toute la page au rendu.
 */

const fetchMock = vi.fn(async (input: unknown) => {
  const url = String(input)
  if (url.startsWith('/api/admin/listings'))
    return { status: 200, json: async () => ({ items: [] }) }
  throw new Error(`fetch inattendu : ${url}`)
})

function rendre() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/admin/logements']}>
        <Routes>
          <Route path="/admin/logements" element={<AdminLogements />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('/admin/logements — formulaire de logement institutionnel', () => {
  it('la page se rend sans crasher et affiche le formulaire de création', async () => {
    rendre()
    expect(await screen.findByText(/Nouveau logement/)).toBeTruthy()
  })
})

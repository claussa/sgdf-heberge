import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressAutocomplete } from '../src/ui/AddressAutocomplete'

const BAN_RESPONSE = {
  features: [
    {
      properties: { label: '12 Rue de la Paix 75002 Paris', city: 'Paris', postcode: '75002' },
      geometry: { coordinates: [2.331, 48.869] },
    },
  ],
}

describe('AddressAutocomplete — édition avec initialQuery', () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => BAN_RESPONSE,
  }))

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("n'appelle pas la BAN et n'ouvre pas la liste au montage quand initialQuery est pré-rempli", async () => {
    render(
      <AddressAutocomplete
        label="Adresse"
        value={null}
        onChange={() => {}}
        initialQuery="12 Rue de la Paix 75002 Paris"
      />,
    )

    // le debounce de 300 ms passe, puis toutes les micro-tâches
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('recherche et ouvre la liste dès que l’utilisateur modifie la saisie', async () => {
    render(
      <AddressAutocomplete
        label="Adresse"
        value={null}
        onChange={() => {}}
        initialQuery="12 Rue de la Paix 75002 Paris"
      />,
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '14 Rue de la Paix' } })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('list')).toBeTruthy()
  })
})

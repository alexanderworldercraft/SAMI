import { act } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import StatisticsTimeline from './StatisticsTimeline'

const makeTimeline = (url) => {
  const params = new URL(url).searchParams
  const period = params.get('period')
  const total = period === '7' ? 7 : 3

  return {
    metric: params.get('metric'),
    period,
    points: [
      { date: '2026-07-28', count: 2, total: 2 },
      { date: '2026-07-29', count: total - 2, total },
    ],
    total,
    average: total / 2,
    peak: total - 2,
    granularity: 'day',
  }
}

describe('StatisticsTimeline', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation(async (url) => ({
      ok: true,
      json: async () => makeTimeline(url),
    }))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('permet de sélectionner une métrique et une période', async () => {
    await act(async () => {
      render(<StatisticsTimeline />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await screen.findByRole('img', {
      name: 'Évolution cumulative : Vidéos',
    })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Vue' }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(await screen.findByRole('img', {
      name: 'Évolution cumulative : Toutes les vues',
    })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Vue épisodes' }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(await screen.findByRole('img', {
      name: 'Évolution cumulative : Vues d’épisodes',
    })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '7 jours' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(global.fetch.mock.calls.some(([url]) => (
        url.includes('metric=episode-views') && url.includes('period=7')
      ))).toBe(true)
    })

    expect(await screen.findByText('7 épisodes regardés')).toBeInTheDocument()
    expect(await screen.findByRole('img', {
      name: 'Évolution cumulative : Vues d’épisodes',
    })).toBeInTheDocument()
  })
})

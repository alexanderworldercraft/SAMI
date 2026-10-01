import { render, screen, waitFor } from '@testing-library/react'

import StatsSAMI from './StatsSAMI'

describe('StatsSAMI', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation(async (url) => {
      if (url.includes('/stats/timeline?')) {
        return {
          ok: true,
          json: async () => ({
            metric: 'videos',
            period: '30',
            points: [],
            total: 0,
            average: 0,
            peak: 0,
            granularity: 'day',
          }),
        }
      }

      return {
        ok: true,
        json: async () => ({
          current: {
            totalVideos: 11,
            films: 4,
            episodes: 7,
            series: 3,
            music: 5,
            watchedVideos: 9,
          },
          previous: {
            totalVideos: 8,
            films: 3,
            episodes: 5,
            series: 2,
            music: 4,
            watchedVideos: 6,
          },
        }),
      }
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('affiche les six indicateurs depuis la requête agrégée', async () => {
    render(<StatsSAMI />)

    expect(await screen.findByText('Séries ajoutées')).toBeInTheDocument()
    expect(screen.getByText('Musiques ajoutées')).toBeInTheDocument()
    expect(screen.getByText('Vidéos regardées')).toBeInTheDocument()
    expect(screen.getByText('Total vidéos ajoutées')).toBeInTheDocument()
    expect(screen.getByText('Films ajoutés')).toBeInTheDocument()
    expect(screen.getByText('Épisodes ajoutés')).toBeInTheDocument()

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    const overviewUrl = global.fetch.mock.calls
      .map(([url]) => url)
      .find((url) => url.includes('/api/videos/stats/overview?'))

    expect(overviewUrl).toContain('currentFrom=')
    expect(overviewUrl).toContain('previousTo=')
  })
})

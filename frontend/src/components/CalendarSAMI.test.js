import { act } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import CalendarSAMI, {
  formatCalendarDisplayDate,
  parseLocalCalendarDate,
} from './CalendarSAMI'

jest.mock(
  'react-router-dom',
  () => ({
    Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  }),
  { virtual: true },
)

describe('CalendarSAMI', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation(async (url) => {
      if (url.includes('/calendar/added-by-date')) {
        return {
          ok: true,
          json: async () => ({ '2026-07-29': 5 }),
        }
      }

      return {
        ok: true,
        json: async () => ({
          items: [
            { id: 1, type: 'video', Titre: 'Film test', SaisonID: null },
            { id: 2, type: 'series', Titre: 'Série test' },
            { id: 3, type: 'person', Titre: 'Ada Lovelace' },
            { id: 4, type: 'music', Titre: 'Musique test' },
            { id: 5, type: 'album', Titre: 'Album test' },
          ],
        }),
      }
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('formate la date du drawer dans le fuseau local', () => {
    const date = parseLocalCalendarDate('2026-07-29')

    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(6)
    expect(date.getDate()).toBe(29)
    expect(formatCalendarDisplayDate('2026-07-29')).toBe('29 juillet 2026')
  })

  it('affiche le même total et les cinq familles de contenu dans le drawer', async () => {
    render(
      <CalendarSAMI initialDate={new Date(2026, 6, 29, 12)} />,
    )

    const countBadge = await screen.findByLabelText('5 ajouts')
    await act(async () => {
      fireEvent.click(countBadge.closest('button'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await screen.findByText('Ajouts du 29 juillet 2026')).toBeInTheDocument()
    expect(await screen.findByText('Film test')).toBeInTheDocument()
    expect(screen.getByText('Série test')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Musique test')).toBeInTheDocument()
    expect(screen.getByText('Album test')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute(
      'href',
      '/personnes/3',
    )
    expect(screen.getByRole('link', { name: 'Musique test' })).toHaveAttribute(
      'href',
      '/musique',
    )
  })
})

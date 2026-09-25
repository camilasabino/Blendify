import { render, screen } from '@testing-library/react'
import { UsageStatsView } from './usage-stats'

describe('UsageStatsView', () => {
  it('lists top artists without unlinked Spotify artist photos', () => {
    const { container } = render(
      <UsageStatsView
        stats={{
          artistMixCount: 2,
          genreMixCount: 0,
          uniqueArtists: 1,
          uniqueGenres: 0,
          topArtists: [
            {
              seedKey: 'artist-1',
              name: 'Sade',
              imageUrl: 'https://i.scdn.co/image/sade',
              useCount: 2,
              lastUsedAt: '2026-09-25T00:00:00.000Z',
            },
          ],
          topGenres: [],
        }}
      />,
    )

    expect(screen.getByText('Sade')).toBeVisible()
    expect(container.querySelector('img')).toBeNull()
  })
})

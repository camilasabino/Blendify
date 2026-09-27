import { fireEvent, render, screen } from '@testing-library/react'
import { UsageStatsView } from './usage-stats'

function statsWithArtist(artist: {
  seedKey: string
  name: string
  imageUrl?: string | null
  useCount?: number
}) {
  return {
    artistMixCount: 2,
    genreMixCount: 0,
    uniqueArtists: 1,
    uniqueGenres: 0,
    topArtists: [
      {
        seedKey: artist.seedKey,
        name: artist.name,
        imageUrl: artist.imageUrl ?? null,
        useCount: artist.useCount ?? 2,
        lastUsedAt: '2026-09-25T00:00:00.000Z',
      },
    ],
    topGenres: [],
  }
}

describe('UsageStatsView', () => {
  it('renders the artist photo when one is available', () => {
    const { container } = render(
      <UsageStatsView
        stats={statsWithArtist({
          seedKey: 'artist-1',
          name: 'Sade',
          imageUrl: 'https://i.scdn.co/image/sade',
        })}
      />,
    )

    expect(screen.getByText('Sade')).toBeVisible()
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://i.scdn.co/image/sade',
    )
  })

  it('falls back to the generic icon when there is no image', () => {
    const { container } = render(
      <UsageStatsView
        stats={statsWithArtist({ seedKey: 'artist-1', name: 'Sade' })}
      />,
    )

    expect(container.querySelector('img')).toBeNull()
  })

  it('falls back to the generic icon when the artist photo fails to load', () => {
    const { container } = render(
      <UsageStatsView
        stats={statsWithArtist({
          seedKey: 'artist-1',
          name: 'Sade',
          imageUrl: 'https://i.scdn.co/image/sade',
        })}
      />,
    )

    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    fireEvent.error(img as HTMLImageElement)

    expect(container.querySelector('img')).toBeNull()
  })
})

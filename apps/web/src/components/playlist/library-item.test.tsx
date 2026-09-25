import type { PlaylistSummary } from '@blendify/contracts'
import { LibraryItem } from '@/components/playlist/library-item'
import { renderWithProviders, setAuthState, stubApi, testUser } from '@/test/app-harness'
import { spotifyJazzPlaylist } from '@/test/playlist-fixtures'

function summary(imageUrl: string | null): PlaylistSummary {
  return {
    ...spotifyJazzPlaylist,
    kind: 'artist_mix',
    seeds: [
      {
        type: 'artist',
        id: 'artist-1',
        name: 'Sade',
        imageUrl: 'https://i.scdn.co/image/sade',
      },
    ],
    imageUrl,
  }
}

function renderItem(playlist: PlaylistSummary) {
  setAuthState(testUser)
  stubApi({})
  return renderWithProviders(
    <ul>
      <LibraryItem
        playlist={playlist}
        selecting={false}
        selected={false}
        onToggleSelect={vi.fn()}
        onAskConfirm={vi.fn()}
      />
    </ul>,
    { route: '/app/library' },
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('LibraryItem cover', () => {
  it('never shows seed artwork as the playlist cover', () => {
    const { container } = renderItem(summary(null))

    expect(container.querySelector('img[src="https://i.scdn.co/image/sade"]')).toBeNull()
  })

  it('shows the playlist image that Spotify reports for the playlist', () => {
    const { container } = renderItem(
      summary('https://mosaic.scdn.co/640/playlist-1'),
    )

    expect(
      container.querySelector('img[src="https://mosaic.scdn.co/640/playlist-1"]'),
    ).not.toBeNull()
  })
})

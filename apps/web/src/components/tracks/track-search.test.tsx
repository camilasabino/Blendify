import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { TrackDto } from '@blendify/contracts'
import { api } from '@/lib/api'
import { TrackSearch } from './track-search'

const soWhat: TrackDto = {
  id: 'track-1',
  name: 'So What',
  artistId: 'artist-1',
  artistName: 'Miles Davis',
  durationMs: 562_000,
  popularity: 0,
  uri: 'spotify:track:track-1',
  albumImageUrl: 'https://i.scdn.co/image/kind-of-blue',
  artists: [{ id: 'artist-1', name: 'Miles Davis' }],
  externalUrl: 'https://open.spotify.com/track/track-1',
}

describe('TrackSearch Spotify link-back', () => {
  afterEach(() => vi.restoreAllMocks())

  it('links each track result to the track on Spotify without selecting it', async () => {
    vi.spyOn(api, 'searchTracks').mockResolvedValue({ tracks: [soWhat] })
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <label htmlFor="track-search">Track</label>
        <TrackSearch inputId="track-search" selectedIds={new Set()} onSelect={onSelect} />
      </QueryClientProvider>,
    )

    await user.type(screen.getByRole('combobox', { name: 'Track' }), 'so what')
    const option = await screen.findByRole('option', { name: /So What/ })
    const link = screen.getByRole('link', {
      name: 'Open So What by Miles Davis in Spotify',
    })

    expect(link).toHaveAttribute('href', soWhat.externalUrl)
    expect(option).not.toContainElement(link)
    await user.click(link)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

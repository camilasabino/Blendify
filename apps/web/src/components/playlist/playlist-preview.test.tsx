import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { TrackDto } from '@blendify/contracts'
import { api } from '@/lib/api'
import { PlaylistPreview } from './playlist-preview'

const tracks: TrackDto[] = [
  {
    id: 'track-1',
    name: 'First song',
    artistId: 'artist-1',
    artistName: 'First artist',
    durationMs: 180_000,
    popularity: 50,
    uri: 'spotify:track:track-1',
  },
]

function renderPreview() {
  vi.spyOn(api, 'listPlaybackDevices').mockResolvedValue({ devices: [] })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <PlaylistPreview tracks={tracks} spotifyId="playlist-1" />
    </QueryClientProvider>,
  )
}

describe('PlaylistPreview listen mode tabs', () => {
  afterEach(() => vi.restoreAllMocks())

  it('links each tab to the panel it controls', () => {
    renderPreview()

    const here = screen.getByRole('tab', { name: 'Here' })
    const device = screen.getByRole('tab', { name: 'On your device' })
    const panel = screen.getByRole('tabpanel', { name: 'Here' })

    expect(here).toHaveAttribute('aria-selected', 'true')
    expect(here).toHaveAttribute('aria-controls', panel.id)
    expect(device).toHaveAttribute('aria-selected', 'false')
    expect(device).toHaveAttribute('aria-controls', panel.id)
    expect(here).toHaveAttribute('tabindex', '0')
    expect(device).toHaveAttribute('tabindex', '-1')
  })

  it('moves between tabs with the arrow keys and swaps the panel', async () => {
    const user = userEvent.setup()
    renderPreview()

    const here = screen.getByRole('tab', { name: 'Here' })
    here.focus()
    await user.keyboard('{ArrowRight}')

    const device = screen.getByRole('tab', { name: 'On your device' })
    expect(device).toHaveFocus()
    expect(device).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('tabpanel', { name: 'On your device' }),
    ).toHaveTextContent('First song')

    await user.keyboard('{Home}')
    expect(here).toHaveFocus()
    expect(here).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{End}')
    expect(device).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(here).toHaveFocus()
  })
})

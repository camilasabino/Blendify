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

function renderPreview(items: TrackDto[] = tracks) {
  vi.spyOn(api, 'listPlaybackDevices').mockResolvedValue({ devices: [] })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <PlaylistPreview tracks={items} spotifyId="playlist-1" />
    </QueryClientProvider>,
  )
}

describe('PlaylistPreview listen mode tabs', () => {
  afterEach(() => vi.restoreAllMocks())

  it('links each tab to the panel it controls', () => {
    renderPreview()

    const here = screen.getByRole('tab', { name: 'Listen here' })
    const device = screen.getByRole('tab', { name: 'Play on a device' })
    const panel = screen.getByRole('tabpanel', { name: 'Listen here' })

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

    const here = screen.getByRole('tab', { name: 'Listen here' })
    here.focus()
    await user.keyboard('{ArrowRight}')

    const device = screen.getByRole('tab', { name: 'Play on a device' })
    expect(device).toHaveFocus()
    expect(device).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('tabpanel', { name: 'Play on a device' }),
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

describe('PlaylistPreview track list', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the first songs and reveals the rest on demand', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...tracks[0],
      id: `track-${index + 1}`,
      name: `Song ${index + 1}`,
      uri: `spotify:track:track-${index + 1}`,
    }))
    renderPreview(many)

    expect(screen.getByText('Song 10')).toBeInTheDocument()
    expect(screen.queryByText('Song 11')).toBeNull()

    const toggle = screen.getByRole('button', { name: 'Show all 12 songs' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)

    expect(screen.getByText('Song 12')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Show fewer' }),
    ).toHaveAttribute('aria-expanded', 'true')
  })
})

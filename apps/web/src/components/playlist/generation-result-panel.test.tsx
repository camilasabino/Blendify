import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import type { PlaylistDetail } from '@blendify/contracts'
import { GenerationResultPanel } from './generation-result-panel'
import { GenerationSubmitBar } from './generation-form-shared'

type PanelProps = Parameters<typeof GenerationResultPanel>[0]

function renderPanel(overrides: Partial<PanelProps> = {}) {
  const props: PanelProps = {
    isGenerating: false,
    result: null,
    progress: null,
    error: null,
    coverError: null,
    requestedTrackCount: 0,
    workingTitleKey: 'create.working',
    workingHintKey: 'create.workingHint',
    copied: false,
    onCopy: vi.fn(),
    onRetry: vi.fn(),
    onAdjust: vi.fn(),
    onCreateAnother: vi.fn(),
    ...overrides,
  }
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <GenerationResultPanel {...props} />
    </QueryClientProvider>,
  )
  return { props, container }
}

const readyPlaylist: PlaylistDetail = {
  id: 'playlist-1',
  name: 'Blendify · Mix · Guster',
  description: '',
  kind: 'artist_mix',
  seeds: [{ type: 'artist', id: 'artist-1', name: 'Guster' }],
  seedCount: 1,
  trackCount: 10,
  totalDurationMs: 40 * 60_000,
  spotifyUrl: 'https://open.spotify.com/playlist/playlist-1',
  status: 'COMPLETED',
  missingOnSpotify: false,
  imageUrl: null,
  createdAt: '2026-09-23T12:00:00Z',
  updatedAt: '2026-09-23T12:00:00Z',
  tracks: [],
  generation: {
    version: 1,
    kind: 'artist_mix',
    popularity: 'balanced',
    orderMode: 'random',
    tracksPerSeed: 10,
    seeds: [{ id: 'artist-1', name: 'Guster' }],
  },
}

describe('GenerationResultPanel', () => {
  it('leads the ready state with the playlist name and natural metadata', () => {
    renderPanel({ result: readyPlaylist, requestedTrackCount: 10 })

    expect(
      screen.getByRole('heading', { name: 'Blendify · Mix · Guster' }),
    ).toBeVisible()
    expect(screen.getByText('Playlist ready')).toBeVisible()
    expect(screen.getByText('10 songs · 40 min')).toBeVisible()
  })

  it('tells people they can leave once the request is running', () => {
    renderPanel({ isGenerating: true, requestStarted: true })

    expect(
      screen.getByText(/You can leave this page\. The playlist will still be saved to Spotify/),
    ).toBeVisible()
  })

  it('does not promise background work before the request starts', () => {
    renderPanel({ isGenerating: true, requestStarted: false })

    expect(screen.queryByText(/You can leave this page/)).toBeNull()
  })

  it('renders nothing while idle', () => {
    const { container } = renderPanel()
    expect(container).toBeEmptyDOMElement()
  })

  it('announces progress through a small status region', () => {
    renderPanel({
      isGenerating: true,
      progress: {
        phase: 'matching_tracks',
        current: 2,
        total: 10,
        percent: 20,
      },
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      'Finding songs, 2 of 10',
    )
    expect(
      screen.getByRole('region', { name: 'Creating your playlist' }),
    ).not.toHaveAttribute('aria-live')
  })

  it('shows generation errors in place of the progress with a retry', async () => {
    const user = userEvent.setup()
    const { props } = renderPanel({
      error: 'Spotify is busy right now. Try again in about 2 minutes.',
    })

    expect(
      screen.getByRole('heading', { name: 'Couldn’t create the playlist' }),
    ).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Spotify is busy right now. Try again in about 2 minutes.',
    )

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(props.onRetry).toHaveBeenCalledOnce()
  })
})

describe('GenerationSubmitBar', () => {
  it('describes the CTA with the estimated playlist size', () => {
    render(
      <GenerationSubmitBar
        isGenerating={false}
        disabledReason={null}
        error={null}
        idleLabel="Create playlist"
        busyLabel="Creating…"
        summary="≈ 40 songs · 10 per artist"
        icon={Sparkles}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Create playlist' }),
    ).toHaveAccessibleDescription('≈ 40 songs · 10 per artist')
  })

  it('explains why the CTA is disabled', () => {
    render(
      <GenerationSubmitBar
        isGenerating={false}
        disabledReason="Add at least one artist to continue."
        error={null}
        idleLabel="Create playlist"
        busyLabel="Creating…"
        icon={Sparkles}
      />,
    )

    const button = screen.getByRole('button', { name: 'Create playlist' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(
      'Add at least one artist to continue.',
    )
  })

  it('stays disabled without a reason while generating', () => {
    render(
      <GenerationSubmitBar
        isGenerating
        disabledReason={null}
        error={null}
        idleLabel="Create playlist"
        busyLabel="Creating…"
        icon={Sparkles}
      />,
    )

    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()
  })
})

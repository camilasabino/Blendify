import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import type { PlaylistDetail } from '@blendify/contracts'
import { GenerationResultPanel } from './generation-result-panel'
import { GenerationSubmitBar } from './generation-form-shared'
import { guestJazzPlaylist, jazzTrack } from '@/test/playlist-fixtures'

type PanelProps = Parameters<typeof GenerationResultPanel>[0]

function renderPanel(overrides: Partial<PanelProps> = {}) {
  const props: PanelProps = {
    mode: 'spotify',
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
    renderPanel({
      result: { mode: 'spotify', playlist: readyPlaylist },
      requestedTrackCount: 10,
    })

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

  it('credits Last.fm once next to the published playlist', () => {
    renderPanel({
      result: { mode: 'spotify', playlist: readyPlaylist },
      requestedTrackCount: 10,
    })

    const credits = screen.getAllByRole('link', { name: /Last\.fm/ })
    expect(credits).toHaveLength(1)
    expect(credits[0]).toHaveAttribute('href', 'https://www.last.fm')
    expect(
      screen.getByText(/Music recommendations powered by/),
    ).toBeVisible()
  })
})

describe('GenerationResultPanel in Guest Mode', () => {
  function renderGuest(playlist = guestJazzPlaylist) {
    return renderPanel({
      mode: 'guest',
      result: { mode: 'guest', playlist },
      requestedTrackCount: 1,
    })
  }

  it('shows the generated tracks with credited artists and no Spotify publication state', () => {
    renderGuest()

    expect(
      screen.getByRole('heading', { name: 'Blendify · Mix · Jazz' }),
    ).toBeVisible()
    expect(screen.getByText('Jazz, blended.')).toBeVisible()
    expect(screen.getByText('1 song · 9 min')).toBeVisible()
    const songs = screen.getByRole('list', { name: 'Songs in this playlist' })
    expect(songs).toHaveTextContent('So What')
    expect(songs).toHaveTextContent('Miles Davis, John Coltrane · Kind of Blue')
    expect(screen.queryByRole('link', { name: 'Open in Spotify' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()
    expect(screen.queryByText(/saved to Spotify/)).toBeNull()
    expect(
      screen.getByText(
        'This playlist is temporary. It will be lost if you leave this page or refresh it.',
      ),
    ).toBeVisible()
  })

  it('credits Last.fm alongside the Spotify track credit', () => {
    renderGuest()

    const credits = screen.getAllByRole('link', { name: /Last\.fm/ })
    expect(credits).toHaveLength(1)
    expect(credits[0]).toHaveAttribute('href', 'https://www.last.fm')
    expect(screen.getByText('Track details from')).toBeVisible()
    expect(screen.getByRole('img', { name: 'Spotify' })).toBeVisible()
  })

  it('links each track back to Spotify only when it has a Spotify URL', () => {
    renderGuest({
      ...guestJazzPlaylist,
      tracks: [
        jazzTrack,
        { ...jazzTrack, id: 'track-2', name: 'Blue in Green', externalUrl: undefined },
      ],
    })

    const link = screen.getByRole('link', {
      name: 'Open So What by Miles Davis, John Coltrane in Spotify',
    })
    expect(link).toHaveAttribute('href', jazzTrack.externalUrl)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.queryByRole('link', { name: /Blue in Green/ })).toBeNull()
  })

  it('links Spotify artwork back to its Spotify source', () => {
    const { container } = renderGuest({
      ...guestJazzPlaylist,
      coverArtwork: {
        imageUrl: 'https://i.scdn.co/image/cover',
        spotifyUrl: 'https://open.spotify.com/track/track-1',
      },
    })

    expect(screen.getByText('Track details and artwork from')).toBeVisible()
    expect(screen.getByRole('img', { name: 'Spotify' })).toBeVisible()
    const link = screen.getByRole('link', {
      name: 'Open cover artwork source in Spotify',
    })
    expect(link).toHaveAttribute('href', 'https://open.spotify.com/track/track-1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link.querySelector('img')).toHaveAttribute(
      'src',
      'https://i.scdn.co/image/cover',
    )
    expect(container.querySelectorAll('img[src^="https://i.scdn.co"]')).toHaveLength(1)
  })

  it('does not show Spotify artwork without a Spotify link', () => {
    const { container } = renderGuest({
      ...guestJazzPlaylist,
      coverArtwork: {
        imageUrl: 'https://i.scdn.co/image/cover',
        spotifyUrl: 'https://example.com/not-spotify',
      },
    })

    expect(screen.getByText('Track details from')).toBeVisible()
    expect(container.querySelector('img[src^="https://i.scdn.co"]')).toBeNull()
  })

  it('attributes only track details when no Spotify artwork is shown', () => {
    const { container } = renderGuest()

    expect(screen.getByText('Track details from')).toBeVisible()
    expect(screen.getByRole('img', { name: 'Spotify' })).toBeVisible()
    expect(container.querySelector('img[src^="https://i.scdn.co"]')).toBeNull()
  })

  it('keeps a result without transfer complete and without a transfer control', () => {
    renderGuest()

    expect(screen.getByText('Playlist generated')).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Transfer with Soundiiz' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Soundiiz/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Create another' })).toBeVisible()
  })

  it('offers the Soundiiz transfer when the result includes one', () => {
    renderGuest({
      ...guestJazzPlaylist,
      transfer: { token: 'signed-token', expiresAt: '2026-09-25T13:00:00.000Z' },
    })

    const transfer = screen.getByRole('region', { name: 'Transfer with Soundiiz' })
    expect(transfer).toHaveTextContent(
      'Soundiiz will open an external page where you can choose the destination service and complete the transfer.',
    )
    expect(
      screen.getByRole('button', { name: 'Prepare transfer' }),
    ).toBeVisible()
    expect(document.body).not.toHaveTextContent('signed-token')
  })

  it('does not promise saving while a Guest generation runs', () => {
    renderPanel({
      mode: 'guest',
      isGenerating: true,
      requestStarted: true,
      workingTitleKey: 'create.workingGuest',
      workingHintKey: 'create.workingHintGuest',
    })

    expect(
      screen.getByRole('heading', { name: 'Generating your playlist' }),
    ).toBeVisible()
    expect(screen.queryByText(/Spotify/)).toBeNull()

    expect(
      screen.getByText(
        'Keep this page open until the playlist is ready. It isn’t saved anywhere.',
      ),
    ).toBeVisible()
  })

  it('titles a failed Guest generation without creation wording', () => {
    renderPanel({ mode: 'guest', error: 'Something went wrong.' })

    expect(
      screen.getByRole('heading', { name: 'Couldn’t generate the playlist' }),
    ).toBeVisible()
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

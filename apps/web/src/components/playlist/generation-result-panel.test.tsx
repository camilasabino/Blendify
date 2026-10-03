import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { MemoryRouter } from 'react-router-dom'
import type { GenerationProgress, PlaylistDetail } from '@blendify/contracts'
import { GenerationResultPanel } from './generation-result-panel'
import { GenerationSubmitBar } from './generation-form-shared'
import { guestJazzPlaylist, jazzTrack } from '@/test/playlist-fixtures'

type PanelProps = Parameters<typeof GenerationResultPanel>[0]

function numericTokens(name: string): string[] {
  return screen.getByText(name).closest('li')?.textContent?.match(/\d+/g) ?? []
}

function renderPanel(overrides: Partial<PanelProps> = {}) {
  const props: PanelProps = {
    mode: 'spotify',
    isGenerating: false,
    result: null,
    progress: null,
    failure: null,
    coverError: null,
    requestedTrackCount: 0,
    workingTitleKey: 'create.working',
    workingHintKey: 'create.workingHint',
    copied: false,
    onCopy: vi.fn(),
    onRetry: vi.fn(),
    onCreateNew: vi.fn(),
    onAdjust: vi.fn(),
    onCreateAnother: vi.fn(),
    ...overrides,
  }
  const { container } = render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <GenerationResultPanel {...props} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return { props, container }
}

function progressPanel(progress: GenerationProgress): PanelProps {
  return {
    mode: 'spotify',
    isGenerating: true,
    result: null,
    progress,
    failure: null,
    coverError: null,
    requestedTrackCount: 10,
    workingTitleKey: 'create.working',
    workingHintKey: 'create.workingHint',
    copied: false,
    onCopy: vi.fn(),
    onRetry: vi.fn(),
    onCreateNew: vi.fn(),
    onAdjust: vi.fn(),
    onCreateAnother: vi.fn(),
  }
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
  imageUrl: null,
  createdAt: '2026-09-23T12:00:00Z',
  updatedAt: '2026-09-23T12:00:00Z',
  tracks: [],
  generation: {
    version: 1,
    kind: 'artist_mix',
    filters: { region: null, femaleVocals: false, releaseRange: null, excludeLive: false },
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

  it('tells people they can browse Blendify but must keep the tab open once the request is running', () => {
    renderPanel({ isGenerating: true, requestStarted: true })

    expect(
      screen.getByText(
        /You can browse other sections while this runs\. The playlist will be saved to Spotify/,
      ),
    ).toBeVisible()
    expect(
      screen.getByText(/if you refresh or close it, Blendify can no longer show the result/),
    ).toBeVisible()
  })

  it('does not offer a retry when the outcome of a Spotify creation is uncertain', () => {
    renderPanel({
      failure: {
        kind: 'connection_lost',
        message: 'Blendify lost the connection before it could confirm the result.',
        recovery: 'none',
        playlistUrl: null,
        offersNewCreation: true,
        explainsSpotifyLimit: false,
      },
    })

    expect(screen.getByRole('heading', { name: 'Lost connection' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('lost the connection')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open Library' })).toBeNull()
  })

  it('points to the Library when an uncertain outcome may already be saved there', () => {
    renderPanel({
      failure: {
        kind: 'connection_lost',
        message: 'Blendify lost the connection before it could confirm the result.',
        recovery: 'open_library',
        playlistUrl: null,
        offersNewCreation: true,
        explainsSpotifyLimit: false,
      },
    })

    expect(screen.getByRole('link', { name: 'Open Library' })).toHaveAttribute(
      'href',
      '/app/library',
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Create a new playlist anyway' }),
    ).toBeVisible()
  })

  it('offers an unconfirmed Spotify creation only an explicit new creation, never a retry', async () => {
    const { props } = renderPanel({
      failure: {
        kind: 'unconfirmed',
        message: 'Spotify didn’t confirm whether the playlist was created.',
        recovery: 'none',
        playlistUrl: null,
        offersNewCreation: true,
        explainsSpotifyLimit: false,
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Couldn’t confirm the playlist' }),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    const createNew = screen.getByRole('button', { name: 'Create a new playlist anyway' })
    expect(createNew).toHaveAccessibleDescription(
      'This sends the same request again as a separate playlist. If the previous one was created, you’ll have both in Spotify.',
    )
    await userEvent.setup().click(createNew)
    expect(props.onCreateNew).toHaveBeenCalledOnce()
    expect(props.onRetry).not.toHaveBeenCalled()
  })

  it('links to the created playlist when Spotify could not finish it', () => {
    renderPanel({
      failure: {
        kind: 'incomplete',
        message: 'Blendify created the playlist on Spotify, but couldn’t confirm whether its songs were added.',
        recovery: 'open_playlist',
        playlistUrl: 'https://open.spotify.com/playlist/created-1',
        offersNewCreation: false,
        explainsSpotifyLimit: false,
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Couldn’t finish the playlist' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/playlist/created-1',
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('keeps Try again visible and adds a collapsed explanation for a Spotify limit', async () => {
    const { props } = renderPanel({
      failure: {
        kind: 'failed',
        message: 'Spotify is temporarily limiting requests from Blendify. Try again later.',
        recovery: 'retry',
        playlistUrl: null,
        offersNewCreation: false,
        explainsSpotifyLimit: true,
      },
    })

    const toggle = screen.getByRole('button', { name: 'Why am I seeing this?' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()

    await userEvent.setup().click(toggle)
    expect(screen.getByRole('button', { name: 'Hide details' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
    expect(props.onRetry).not.toHaveBeenCalled()
  })

  it('offers to connect Spotify again instead of a retry when authorization expired', () => {
    renderPanel({
      failure: {
        kind: 'failed',
        message: 'Your Spotify connection is no longer valid.',
        recovery: 'reconnect',
        playlistUrl: null,
        offersNewCreation: false,
        explainsSpotifyLimit: false,
      },
    })

    expect(screen.getByRole('button', { name: 'Connect Spotify' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
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
      'Finding songs, 2 of 10 songs',
    )
    expect(
      screen.getByRole('region', { name: 'Creating your playlist' }),
    ).not.toHaveAttribute('aria-live')
    expect(screen.getByText('2 of 10 songs', { selector: 'p' })).toBeVisible()
  })

  it('shows preparation and publishing without a counter or an ETA', () => {
    const { rerender } = render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <GenerationResultPanel
            {...progressPanel({
              phase: 'resolving_seeds',
              current: 1,
              total: 11,
              percent: 1,
              etaSeconds: 12,
            })}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Preparing your selection',
    )
    expect(screen.getByRole('status')).not.toHaveTextContent(/of /)
    expect(screen.getByText('1%')).toBeVisible()
    expect(screen.queryByText(/of 11/)).toBeNull()
    expect(screen.queryByText(/min remaining/i)).toBeNull()

    rerender(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <GenerationResultPanel
            {...progressPanel({
              phase: 'publishing',
              current: 0,
              total: 3,
              percent: 90,
              etaSeconds: 40,
            })}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Creating the playlist in Spotify',
    )
    expect(screen.getByRole('status')).not.toHaveTextContent(/of /)
    expect(screen.getByText('90%')).toBeVisible()
    expect(screen.queryByText(/of 3/)).toBeNull()
    expect(screen.queryByText(/min remaining/i)).toBeNull()
  })

  it('counts songs found during search, including a partial fill', () => {
    const { rerender } = render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <GenerationResultPanel
            {...progressPanel({
              phase: 'matching_tracks',
              current: 0,
              total: 10,
              percent: 10,
              etaSeconds: 20,
            })}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Finding songs, 0 of 10 songs',
    )
    expect(screen.getByText('0 of 10 songs', { selector: 'p' })).toBeVisible()
    expect(screen.getByText('10%')).toBeVisible()
    expect(screen.queryByText(/min remaining/i)).toBeNull()

    rerender(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <GenerationResultPanel
            {...progressPanel({
              phase: 'matching_tracks',
              current: 3,
              total: 10,
              percent: 34,
            })}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Finding songs, 3 of 10 songs',
    )
    expect(screen.getByText('3 of 10 songs', { selector: 'p' })).toBeVisible()

    rerender(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <GenerationResultPanel
            {...progressPanel({
              phase: 'matching_tracks',
              current: 6,
              total: 10,
              percent: 58,
              etaSeconds: 15,
            })}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Finding songs, 6 of 10 songs',
    )
    expect(screen.getByText('6 of 10 songs', { selector: 'p' })).toBeVisible()
    expect(screen.getByText('58%')).toBeVisible()
    expect(screen.queryByText('10 of 10 songs')).toBeNull()
    expect(screen.queryByText(/min remaining/i)).toBeNull()
  })

  it('shows generation errors in place of the progress with a retry', async () => {
    const user = userEvent.setup()
    const { props } = renderPanel({
      failure: {
        kind: 'failed',
        message: 'Spotify is busy right now. Try again in about 2 minutes.',
        recovery: 'retry',
        playlistUrl: null,
        offersNewCreation: false,
        explainsSpotifyLimit: false,
      },
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

  it('closes a short fill as a finished playlist', () => {
    renderPanel({
      mode: 'guest',
      isGenerating: false,
      workingTitleKey: 'create.workingGuest',
      requestedTrackCount: 10,
      result: {
        mode: 'guest',
        playlist: {
          ...guestJazzPlaylist,
          tracks: Array.from({ length: 6 }, (_, index) => ({
            ...jazzTrack,
            id: `track-${index}`,
            uri: `spotify:track:track-${index}`,
            externalUrl: `https://open.spotify.com/track/track-${index}`,
          })),
        },
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Blendify · Mix · Jazz' }),
    ).toBeVisible()
    expect(screen.getByText(/Found 6 of 10 songs/)).toBeVisible()
    expect(screen.queryByText('Finding songs')).toBeNull()
    expect(screen.queryByText('58%')).toBeNull()
    expect(screen.queryByText(/10 of 10/)).toBeNull()
    expect(screen.queryByText(/min remaining/i)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

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

  it('does not present unknown track popularity as a zero score', () => {
    renderGuest({
      ...guestJazzPlaylist,
      tracks: [
        { ...jazzTrack, popularity: 73 },
        {
          ...jazzTrack,
          id: 'track-2',
          name: 'Blue in Green',
          uri: 'spotify:track:track-2',
          popularity: 0,
        },
        {
          ...jazzTrack,
          id: 'track-3',
          name: 'Flamenco Sketches',
          uri: 'spotify:track:track-3',
          popularity: null,
        },
      ],
    })

    expect(numericTokens('So What')).toEqual(['1', '9', '05'])
    expect(numericTokens('Blue in Green')).toEqual(['2', '9', '05'])
    expect(numericTokens('Flamenco Sketches')).toEqual(['3', '9', '05'])
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
        'Keep this page open until the playlist is ready. Leaving stops it, and nothing is saved.',
      ),
    ).toBeVisible()
  })

  it('titles a failed Guest generation without creation wording', () => {
    renderPanel({
      mode: 'guest',
      failure: {
        kind: 'failed',
        message: 'Something went wrong.',
        recovery: 'retry',
        playlistUrl: null,
        offersNewCreation: false,
        explainsSpotifyLimit: false,
      },
    })

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

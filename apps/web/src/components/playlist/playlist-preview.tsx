import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ExternalLink, Play, Speaker } from 'lucide-react'
import { api, ApiError, type PlaylistTrack } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useT } from '@/i18n/use-t'
import { cn, focusRing, formatDuration } from '@/lib/utils'

type ListenMode = 'here' | 'device'

type PlayInput = {
  contextUri?: string
  uris?: string[]
  offsetUri?: string
}

type PlaylistPreviewProps = {
  tracks?: PlaylistTrack[]
  spotifyId?: string | null
  spotifyUrl?: string | null
  imageUrl?: string | null
  className?: string
  mode?: 'full' | 'embed'
}

function isDeviceMissingError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (
    error.code === 'NO_ACTIVE_DEVICE' ||
    error.code === 'PLAYBACK_NOT_FOUND'
  ) {
    return true
  }
  return /no active device|device not found/i.test(error.message)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function playlistWebUrl(playlistId: string, spotifyUrl?: string | null) {
  return (
    spotifyUrl?.trim() ||
    `https://open.spotify.com/playlist/${encodeURIComponent(playlistId)}`
  )
}

function openSpotifyPlaylist(playlistId: string, spotifyUrl?: string | null) {
  const webUrl = playlistWebUrl(playlistId, spotifyUrl)

  const deepLink = document.createElement('a')
  deepLink.href = `spotify:playlist:${playlistId}`
  deepLink.rel = 'noreferrer'
  document.body.appendChild(deepLink)
  deepLink.click()
  deepLink.remove()

  const webLink = document.createElement('a')
  webLink.href = webUrl
  webLink.target = '_blank'
  webLink.rel = 'noopener noreferrer'
  document.body.appendChild(webLink)
  webLink.click()
  webLink.remove()
}

function InPagePlayer({
  tracks,
  spotifyId,
}: {
  tracks: PlaylistTrack[]
  spotifyId: string
}) {
  const t = useT()
  const list = tracks.filter((track) => track.id && track.name)
  const [index, setIndex] = useState(0)
  const [autoplay, setAutoplay] = useState(false)

  const current = list[index] ?? null
  const hasCustomTracks = list.length > 0

  function selectTrack(trackIndex: number) {
    setIndex(trackIndex)
    setAutoplay(true)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-cream-200/10 bg-charcoal-900/80 shadow-[0_20px_60px_-28px_rgb(0_0_0_/_0.85)]">
      {hasCustomTracks && current ? (
        <>
          <div className="relative bg-[#121212]">
            <iframe
              key={`${current.id}-${autoplay ? 'play' : 'idle'}`}
              title={current.name}
              src={`https://open.spotify.com/embed/track/${encodeURIComponent(current.id)}?utm_source=generator&theme=0${autoplay ? '&autoplay=1' : ''}`}
              width="100%"
              height={152}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              className="block border-0"
            />
            {/*
              Spotify’s embed always shows “Save”. We can’t remove it, so we
              cover that row and show the album below the player instead.
            */}
            <div
              aria-hidden
              className="pointer-events-auto absolute z-[1] bg-[#121212]"
              style={{
                left: 'clamp(6.5rem, 22%, 8.5rem)',
                right: 'clamp(5rem, 18%, 7rem)',
                top: '2.7rem',
                height: '1.4rem',
              }}
            />
          </div>

          <p className="border-t border-cream-200/10 bg-charcoal-950/60 px-3 py-2 text-xs text-cream-400">
            <span className="text-cream-500">{t('preview.albumLabel')}: </span>
            {current.albumName?.trim() || t('preview.unknownAlbum')}
          </p>

          <ol className="max-h-[16rem] overflow-y-auto border-t border-cream-200/10">
            {list.map((track, trackIndex) => {
              const selected = trackIndex === index
              return (
                <li key={`${track.id}-${trackIndex}`}>
                  <button
                    type="button"
                    onClick={() => selectTrack(trackIndex)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                      focusRing,
                      selected ? 'bg-amber-500/15' : 'hover:bg-cream-50/5',
                    )}
                  >
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums text-cream-500">
                      {trackIndex + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'truncate text-sm',
                          selected ? 'text-amber-300' : 'text-cream-50',
                        )}
                      >
                        {track.name}
                      </p>
                      <p className="truncate text-xs text-cream-400">
                        {track.artistName}
                        {track.albumName ? ` · ${track.albumName}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-cream-500">
                      {formatDuration(track.durationMs)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      ) : (
        <iframe
          title={t('preview.player')}
          src={`https://open.spotify.com/embed/playlist/${encodeURIComponent(spotifyId)}?utm_source=generator&theme=0`}
          width="100%"
          height={352}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="block border-0"
        />
      )}
    </div>
  )
}

export function PlaylistPreview({
  tracks = [],
  spotifyId,
  spotifyUrl,
  imageUrl: _imageUrl,
  className,
  mode = 'full',
}: PlaylistPreviewProps) {
  void _imageUrl;
  const t = useT()
  const list = useMemo(
    () => tracks.filter((track) => track.id && track.name),
    [tracks],
  )
  const embedId = spotifyId?.trim() || null
  const contextUri = embedId ? `spotify:playlist:${embedId}` : undefined
  const canConnect = mode === 'full' && list.length > 0
  const canEmbed = Boolean(embedId)
  const [listenMode, setListenMode] = useState<ListenMode>(
    canEmbed ? 'here' : 'device',
  )
  const [activeUri, setActiveUri] = useState<string | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [lastPlay, setLastPlay] = useState<PlayInput | null>(null)

  const devicesQuery = useQuery({
    queryKey: ['playback-devices'],
    queryFn: api.listPlaybackDevices,
    enabled: mode === 'full' && listenMode === 'device',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const hasKnownDevice = (devicesQuery.data?.devices.length ?? 0) > 0

  const playMutation = useMutation({
    mutationFn: async (input: {
      play: PlayInput
      openedSpotify: boolean
    }) => {
      setLastPlay(input.play)
      if (input.openedSpotify) {
        await sleep(3200)
      }
      try {
        return await api.playOnSpotify(input.play)
      } catch (error) {
        if (input.openedSpotify && isDeviceMissingError(error)) {
          await sleep(2200)
          return await api.playOnSpotify(input.play)
        }
        throw error
      }
    },
    onMutate: () => {
      setPlayError(null)
      setStatus(null)
    },
    onSuccess: () => {
      void devicesQuery.refetch()
      setStatus(t('preview.playOpened'))
    },
    onError: (error, variables) => {
      if (error instanceof ApiError && isDeviceMissingError(error)) {
        setPlayError(
          variables.openedSpotify
            ? t('preview.deviceStillMissing')
            : t('preview.deviceMissing'),
        )
        return
      }
      if (error instanceof ApiError) {
        setPlayError(error.message)
        return
      }
      setPlayError(t('preview.playError'))
    },
  })

  if (!canEmbed && !canConnect) return null

  const showSwitcher = mode === 'full' && canEmbed && canConnect
  const showEmbed =
    mode === 'embed' ||
    (mode === 'full' && canEmbed && (!showSwitcher || listenMode === 'here'))
  const showConnect =
    mode === 'full' && canConnect && (!showSwitcher || listenMode === 'device')

  function startPlay(play: PlayInput) {
    if (embedId) {
      openSpotifyPlaylist(embedId, spotifyUrl)
    }
    const needsWait = Boolean(embedId) && !hasKnownDevice
    if (needsWait) {
      setStatus(t('preview.wakingDevice'))
    }
    playMutation.mutate({ play, openedSpotify: needsWait })
  }

  function playPlaylist() {
    if (!contextUri) return
    setActiveUri(null)
    startPlay({ contextUri })
  }

  function playTrack(track: PlaylistTrack) {
    setActiveUri(track.uri)
    if (contextUri) {
      startPlay({ contextUri, offsetUri: track.uri })
      return
    }
    startPlay({ uris: [track.uri] })
  }

  function retryPlay() {
    if (!lastPlay || !embedId) return
    openSpotifyPlaylist(embedId, spotifyUrl)
    setStatus(t('preview.wakingDevice'))
    playMutation.mutate({ play: lastPlay, openedSpotify: true })
  }

  function openSpotify() {
    if (!embedId) return
    openSpotifyPlaylist(embedId, spotifyUrl)
  }

  function switchMode(next: ListenMode) {
    setListenMode(next)
    setPlayError(null)
    setStatus(null)
    setActiveUri(null)
    playMutation.reset()
  }

  return (
    <div className={cn('space-y-4', className)}>
      {showSwitcher && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-cream-500">
            {t('preview.modeLabel')}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              className="inline-flex items-center rounded-lg border border-cream-200/15 bg-charcoal-800/60 p-0.5"
              role="tablist"
              aria-label={t('preview.modeLabel')}
            >
              {(
                [
                  { id: 'here' as const, label: t('preview.modeHere') },
                  { id: 'device' as const, label: t('preview.modeDevice') },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={listenMode === option.id}
                  onClick={() => switchMode(option.id)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors duration-200',
                    focusRing,
                    listenMode === option.id
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'text-cream-400 hover:text-cream-100',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {listenMode === 'device' && contextUri && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={playMutation.isPending && !activeUri}
                disabled={playMutation.isPending}
                onClick={playPlaylist}
              >
                {!(playMutation.isPending && !activeUri) ? (
                  <Speaker className="size-3.5" />
                ) : null}
                {t('preview.playOnDevice')}
              </Button>
            )}
          </div>
          <p className="max-w-lg text-xs text-cream-400">
            {listenMode === 'here'
              ? t('preview.playerHint')
              : t('preview.connectHint')}
          </p>
        </div>
      )}

      {showEmbed && embedId && (
        <InPagePlayer tracks={list} spotifyId={embedId} />
      )}

      {showConnect && (
        <section className="space-y-3">
          {!showSwitcher && (
            <div className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-cream-500">
                  {t('preview.connectList')}
                </p>
                <p className="text-xs tabular-nums text-cream-500">
                  {t('preview.trackCount', { count: list.length })}
                </p>
              </div>
              <p className="max-w-lg text-xs text-cream-400">
                {t('preview.connectHint')}
              </p>
            </div>
          )}
          {showSwitcher && (
            <p className="text-right text-xs tabular-nums text-cream-500">
              {t('preview.trackCount', { count: list.length })}
            </p>
          )}

          <ol className="max-h-[18rem] overflow-y-auto rounded-xl border border-cream-200/10 bg-charcoal-800/30">
            {list.map((track, trackIndex) => {
              const isActive = activeUri === track.uri && playMutation.isPending
              const isPlaying =
                activeUri === track.uri &&
                playMutation.isSuccess &&
                !playError
              return (
                <li key={`${track.id}-${trackIndex}`}>
                  <button
                    type="button"
                    onClick={() => playTrack(track)}
                    disabled={playMutation.isPending}
                    className={cn(
                      'flex w-full items-center gap-3 border-b border-cream-200/5 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-amber-500/10 disabled:opacity-60',
                      focusRing,
                      isPlaying && 'bg-amber-500/10',
                    )}
                  >
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums text-cream-500">
                      {trackIndex + 1}
                    </span>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-charcoal-700 text-amber-400">
                      {isActive ? (
                        <Spinner size="sm" className="text-current" />
                      ) : (
                        <Play className="size-3.5 fill-current" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-cream-50">
                        {track.name}
                      </p>
                      <p className="truncate text-xs text-cream-400">
                        {track.artistName}
                        {track.albumName ? ` · ${track.albumName}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-cream-500">
                      {formatDuration(track.durationMs)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {mode === 'full' && listenMode === 'device' && status && !playError && (
        <p className="text-sm text-cream-300" role="status">
          {status}
        </p>
      )}
      {mode === 'full' && listenMode === 'device' && playError && (
        <div className="space-y-2" role="status">
          <p className="text-sm text-amber-200/90">{playError}</p>
          <div className="flex flex-wrap gap-2">
            {embedId && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={openSpotify}
              >
                <ExternalLink className="size-3.5" />
                {t('create.openSpotify')}
              </Button>
            )}
            {lastPlay && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={playMutation.isPending}
                onClick={retryPlay}
              >
                {t('preview.retryPlay')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

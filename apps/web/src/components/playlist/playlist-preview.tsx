import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ExternalLink, Play, Speaker } from 'lucide-react'
import type { StartPlaybackRequest, TrackDto } from '@blendify/contracts'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useT } from '@/i18n/use-t'
import { getApiErrorMessage } from '@/lib/api-error'
import { cn, focusRing, formatDuration } from '@/lib/utils'
import { InPagePlaylistPlayer } from '@/components/playlist/in-page-playlist-player'
import { TrackListToggle } from '@/components/playlist/track-list-disclosure'
import { useTrackListDisclosure } from '@/hooks/use-track-list-disclosure'

type ListenMode = 'here' | 'device'

const LISTEN_MODES: readonly ListenMode[] = ['here', 'device']

const DEVICE_WAKE_MS = 3200
const DEVICE_RETRY_MS = 2200

type PlaylistPreviewProps = Readonly<{
  tracks?: TrackDto[]
  spotifyId?: string | null
  spotifyUrl?: string | null
  className?: string
  mode?: 'full' | 'embed'
}>

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

function ListenModeTabs({
  value,
  onChange,
  tabId,
  panelId,
}: Readonly<{
  value: ListenMode
  onChange: (mode: ListenMode) => void
  tabId: (mode: ListenMode) => string
  panelId: string
}>) {
  const t = useT()
  const tabRefs = useRef<Partial<Record<ListenMode, HTMLButtonElement | null>>>(
    {},
  )
  const labels: Record<ListenMode, string> = {
    here: t('preview.modeHere'),
    device: t('preview.modeDevice'),
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = LISTEN_MODES.indexOf(value)
    let next: ListenMode | undefined
    if (event.key === 'ArrowRight') {
      next = LISTEN_MODES[(index + 1) % LISTEN_MODES.length]
    } else if (event.key === 'ArrowLeft') {
      next = LISTEN_MODES.at(index - 1)
    } else if (event.key === 'Home') {
      next = LISTEN_MODES[0]
    } else if (event.key === 'End') {
      next = LISTEN_MODES.at(-1)
    }
    if (!next) return
    event.preventDefault()
    onChange(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-card border border-control bg-field p-1"
      role="tablist"
      aria-label={t('preview.modeLabel')}
    >
      {LISTEN_MODES.map((mode) => {
        const selected = value === mode
        return (
          <button
            key={mode}
            ref={(element) => {
              tabRefs.current[mode] = element
            }}
            id={tabId(mode)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(mode)}
            onKeyDown={handleKeyDown}
            className={cn(
              'rounded-control border px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors duration-200',
              focusRing,
              selected
                ? 'border-accent-line bg-accent-soft text-accent-fg'
                : 'border-transparent text-cream-300 hover:bg-hover hover:text-cream-50',
            )}
          >
            {labels[mode]}
          </button>
        )
      })}
    </div>
  )
}

function PlaybackTrackList({
  deviceListId,
  tracks,
  activeUri,
  isPending,
  isSuccess,
  playError,
  onPlayTrack,
  collapsible,
  expanded,
  total,
  onToggle,
}: Readonly<{
  deviceListId: string
  tracks: readonly TrackDto[]
  activeUri: string | null
  isPending: boolean
  isSuccess: boolean
  playError: string | null
  onPlayTrack: (track: TrackDto) => void
  collapsible: boolean
  expanded: boolean
  total: number
  onToggle: () => void
}>) {
  return (
    <div className="overflow-hidden rounded-card border border-divider bg-card">
      <ol id={deviceListId}>
        {tracks.map((track, trackIndex) => {
          const isActive = activeUri === track.uri && isPending
          const isPlaying = activeUri === track.uri && isSuccess && !playError
          return (
            <li key={`${track.id}-${trackIndex}`}>
              <button
                type="button"
                onClick={() => onPlayTrack(track)}
                disabled={isPending}
                className={cn(
                  'flex w-full items-center gap-3 border-b border-divider px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-hover disabled:opacity-50',
                  focusRing,
                  isPlaying && 'bg-accent-soft',
                )}
              >
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-cream-400">
                  {trackIndex + 1}
                </span>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-charcoal-700 text-accent-fg">
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
                <span className="shrink-0 text-xs tabular-nums text-cream-400">
                  {formatDuration(track.durationMs)}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {collapsible ? (
        <TrackListToggle
          expanded={expanded}
          total={total}
          controls={deviceListId}
          onToggle={onToggle}
        />
      ) : null}
    </div>
  )
}

export function PlaylistPreview({
  tracks = [],
  spotifyId,
  spotifyUrl,
  className,
  mode = 'full',
}: PlaylistPreviewProps) {
  const t = useT()
  const tabsId = useId()
  const panelId = `${tabsId}-panel`
  const deviceListId = `${tabsId}-tracks`
  const tabId = (listenMode: ListenMode) => `${tabsId}-tab-${listenMode}`
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
  const [lastPlay, setLastPlay] = useState<StartPlaybackRequest | null>(null)

  const devicesQuery = useQuery({
    queryKey: ['playback-devices'],
    queryFn: api.listPlaybackDevices,
    enabled: mode === 'full' && listenMode === 'device',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const hasKnownDevice = (devicesQuery.data?.devices.length ?? 0) > 0
  const disclosure = useTrackListDisclosure(list)

  const playMutation = useMutation({
    mutationFn: async (input: {
      play: StartPlaybackRequest
      openedSpotify: boolean
    }) => {
      setLastPlay(input.play)
      if (input.openedSpotify) {
        await sleep(DEVICE_WAKE_MS)
      }
      try {
        return await api.playOnSpotify(input.play)
      } catch (error) {
        if (input.openedSpotify && isDeviceMissingError(error)) {
          await sleep(DEVICE_RETRY_MS)
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
        setPlayError(getApiErrorMessage(error, t, 'preview.playError'))
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

  function startPlay(play: StartPlaybackRequest) {
    if (embedId) {
      openSpotifyPlaylist(embedId, spotifyUrl)
    }
    const preferredDeviceId = devicesQuery.data?.devices.find(
      (device) => device.isActive,
    )?.id
    const knownDeviceId =
      preferredDeviceId ?? devicesQuery.data?.devices[0]?.id
    const needsWait = Boolean(embedId) && !hasKnownDevice
    if (needsWait) {
      setStatus(t('preview.wakingDevice'))
    }
    playMutation.mutate({
      play: {
        ...play,
        ...(knownDeviceId ? { deviceId: knownDeviceId } : {}),
      },
      openedSpotify: needsWait,
    })
  }

  function playPlaylist() {
    if (!contextUri) return
    setActiveUri(null)
    startPlay({ contextUri })
  }

  function playTrack(track: TrackDto) {
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ListenModeTabs
              value={listenMode}
              onChange={switchMode}
              tabId={tabId}
              panelId={panelId}
            />
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
          {listenMode === 'device' ? (
            <p className="max-w-lg text-xs text-cream-400">
              {t('preview.connectHint')}
            </p>
          ) : null}
        </div>
      )}

      <div
        id={showSwitcher ? panelId : undefined}
        role={showSwitcher ? 'tabpanel' : undefined}
        aria-labelledby={showSwitcher ? tabId(listenMode) : undefined}
        className="space-y-4"
      >
        {showEmbed && embedId && (
          <InPagePlaylistPlayer tracks={list} spotifyId={embedId} />
        )}

        {showConnect && (
          <section className="space-y-3">
            {!showSwitcher && (
              <div className="space-y-1">
                <p className="text-eyebrow text-cream-400">
                  {t('preview.connectList')}
                </p>
                <p className="max-w-lg text-xs text-cream-400">
                  {t('preview.connectHint')}
                </p>
              </div>
            )}
            <PlaybackTrackList
              deviceListId={deviceListId}
              tracks={disclosure.visible}
              activeUri={activeUri}
              isPending={playMutation.isPending}
              isSuccess={playMutation.isSuccess}
              playError={playError}
              onPlayTrack={playTrack}
              collapsible={disclosure.collapsible}
              expanded={disclosure.expanded}
              total={list.length}
              onToggle={disclosure.toggle}
            />
          </section>
        )}

        {mode === 'full' && listenMode === 'device' && status && !playError && (
          <output className="block text-sm text-cream-300">{status}</output>
        )}
        {mode === 'full' && listenMode === 'device' && playError && (
          <output className="block space-y-2">
            <p className="text-sm text-warning">{playError}</p>
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
          </output>
        )}
      </div>
    </div>
  )
}

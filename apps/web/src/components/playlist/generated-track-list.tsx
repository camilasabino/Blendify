import { useId } from 'react'
import type { TrackDto } from '@blendify/contracts'
import { SpotifyMark } from '@/components/brand/spotify-mark'
import { TrackListToggle } from '@/components/playlist/track-list-disclosure'
import { useTrackListDisclosure } from '@/hooks/use-track-list-disclosure'
import { useT } from '@/i18n/use-t'
import {
  cn,
  focusRing,
  formatCreditedArtists,
  formatDuration,
  toSafeHttpsUrl,
} from '@/lib/utils'

function TrackSpotifyLink({ track }: Readonly<{ track: TrackDto }>) {
  const t = useT()
  const href = toSafeHttpsUrl(track.externalUrl)
  if (!href) return <span aria-hidden className="size-8 shrink-0" />
  const label = t('guestResult.openTrackInSpotify', {
    track: track.name,
    artists: formatCreditedArtists(track),
  })
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-control text-white transition-colors hover:bg-hover',
        focusRing,
      )}
    >
      <span aria-hidden className="inline-flex">
        <SpotifyMark variant="mono" className="size-3.5" title="" />
      </span>
    </a>
  )
}

export function GeneratedTrackList({
  tracks,
}: Readonly<{
  tracks: TrackDto[]
}>) {
  const t = useT()
  const listId = useId()
  const disclosure = useTrackListDisclosure(tracks)

  if (tracks.length === 0) return null

  return (
    <div className="overflow-hidden rounded-card border border-divider bg-card">
      <ol id={listId} aria-label={t('guestResult.trackList')}>
        {disclosure.visible.map((track, trackIndex) => (
          <li
            key={`${track.id}-${trackIndex}`}
            className="flex items-center gap-3 border-b border-divider px-3 py-2.5 last:border-b-0"
          >
            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-cream-400">
              {trackIndex + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-cream-50">{track.name}</p>
              <p className="truncate text-xs text-cream-400">
                {formatCreditedArtists(track)}
                {track.albumName ? ` · ${track.albumName}` : ''}
              </p>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-cream-400">
              {formatDuration(track.durationMs)}
            </span>
            <TrackSpotifyLink track={track} />
          </li>
        ))}
      </ol>
      {disclosure.collapsible ? (
        <TrackListToggle
          expanded={disclosure.expanded}
          total={tracks.length}
          controls={listId}
          onToggle={disclosure.toggle}
        />
      ) : null}
    </div>
  )
}

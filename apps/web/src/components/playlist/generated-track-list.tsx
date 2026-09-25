import { useId } from 'react'
import type { TrackDto } from '@blendify/contracts'
import { SpotifyLink } from '@/components/brand/spotify-link'
import { TrackListToggle } from '@/components/playlist/track-list-disclosure'
import { useTrackListDisclosure } from '@/hooks/use-track-list-disclosure'
import { useT } from '@/i18n/use-t'
import {
  formatCreditedArtists,
  formatDuration,
  toSpotifyUrl,
} from '@/lib/utils'

function TrackSpotifyLink({ track }: Readonly<{ track: TrackDto }>) {
  const t = useT()
  if (!toSpotifyUrl(track.externalUrl)) {
    return <span aria-hidden className="size-[43px] shrink-0" />
  }
  return (
    <SpotifyLink
      href={track.externalUrl}
      label={t('guestResult.openTrackInSpotify', {
        track: track.name,
        artists: formatCreditedArtists(track),
      })}
    />
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

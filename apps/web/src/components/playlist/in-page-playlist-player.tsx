import { useId, useState } from 'react'
import type { TrackDto } from '@blendify/contracts'
import { TrackListToggle } from '@/components/playlist/track-list-disclosure'
import { useTrackListDisclosure } from '@/hooks/use-track-list-disclosure'
import { useT } from '@/i18n/use-t'
import { cn, focusRing, formatDuration } from '@/lib/utils'

export function InPagePlaylistPlayer({
  tracks,
  spotifyId,
}: Readonly<{
  tracks: TrackDto[]
  spotifyId: string
}>) {
  const t = useT()
  const list = tracks.filter((track) => track.id && track.name)
  const [index, setIndex] = useState(0)
  const [autoplay, setAutoplay] = useState(false)
  const current = list[index] ?? null
  const listId = useId()
  const disclosure = useTrackListDisclosure(list)

  function selectTrack(trackIndex: number) {
    setIndex(trackIndex)
    setAutoplay(true)
  }

  return (
    <div className="overflow-hidden rounded-panel border border-divider bg-charcoal-900 shadow-[0_20px_60px_-28px_rgb(0_0_0_/_0.85)]">
      {current ? (
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
          </div>
          <ol id={listId} className="border-t border-divider">
            {disclosure.visible.map((track, trackIndex) => {
              const selected = trackIndex === index
              return (
                <li key={`${track.id}-${trackIndex}`}>
                  <button
                    type="button"
                    onClick={() => selectTrack(trackIndex)}
                    aria-current={selected ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                      focusRing,
                      selected ? 'bg-accent-soft' : 'hover:bg-hover',
                    )}
                  >
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums text-cream-400">
                      {trackIndex + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-sm',
                          selected ? 'text-accent-fg' : 'text-cream-50',
                        )}
                      >
                        {track.name}
                      </span>
                      <span className="block truncate text-xs text-cream-400">
                        {track.artistName}
                        {track.albumName ? ` · ${track.albumName}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-cream-400">
                      {formatDuration(track.durationMs)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          {disclosure.collapsible ? (
            <TrackListToggle
              expanded={disclosure.expanded}
              total={list.length}
              controls={listId}
              onToggle={disclosure.toggle}
            />
          ) : null}
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

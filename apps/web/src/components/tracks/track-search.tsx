import type { TrackDto } from '@blendify/contracts'
import { api, getApiErrorMessage, isRequestLimited, isSpotifyRateLimited } from '@/lib/api'
import { SpotifyLink } from '@/components/brand/spotify-link'
import { SearchCombobox } from '@/components/ui/search-combobox'
import { useT } from '@/i18n/use-t'
import { formatCreditedArtists, formatDuration } from '@/lib/utils'

type TrackSearchProps = Readonly<{
  selectedIds: Set<string>
  inputId?: string
  onSelect: (track: TrackDto) => void
  disabled?: boolean
  className?: string
}>

export function TrackSearch(props: TrackSearchProps) {
  const t = useT()

  return (
    <SearchCombobox
      queryKey="tracks"
      search={async (query) => (await api.searchTracks(query)).tracks}
      selectedIds={props.selectedIds}
      onSelect={props.onSelect}
      inputId={props.inputId}
      placeholder={t('search.trackPlaceholder')}
      resultsLabel={t('search.trackResults')}
      clearLabel={t('search.clear')}
      emptyLabel={t('search.trackEmpty')}
      errorLabel={(error) =>
        isSpotifyRateLimited(error) || isRequestLimited(error)
          ? getApiErrorMessage(error, t, 'search.rateLimited')
          : t('search.trackError')
      }
      disabled={props.disabled}
      className={props.className}
      renderOption={(track, selected) => (
        <>
          {track.albumImageUrl ? (
            <img
              src={track.albumImageUrl}
              alt=""
              className="size-9 shrink-0 rounded object-cover"
            />
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded bg-charcoal-600 text-xs text-cream-200">
              {track.name.slice(0, 1)}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-cream-50">
              {track.name}
            </span>
            <span className="block truncate text-xs text-cream-400">
              {track.artistName}
            </span>
          </span>
          <span className="shrink-0 text-xs tabular-nums text-cream-500">
            {formatDuration(track.durationMs)}
          </span>
          {selected ? (
            <span className="shrink-0 text-xs text-cream-400">
              {t('search.added')}
            </span>
          ) : null}
        </>
      )}
      renderOptionAction={(track) => (
        <SpotifyLink
          href={track.externalUrl}
          label={t('guestResult.openTrackInSpotify', {
            track: track.name,
            artists: formatCreditedArtists(track),
          })}
        />
      )}
    />
  )
}

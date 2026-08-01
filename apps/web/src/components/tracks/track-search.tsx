import type { TrackDto } from '@blendify/contracts'
import { api, getApiErrorMessage, isSpotifyRateLimited } from '@/lib/api'
import { SearchCombobox } from '@/components/ui/search-combobox'
import { useT } from '@/i18n/use-t'
import { formatDuration } from '@/lib/utils'

type TrackSearchProps = Readonly<{
  selectedIds: Set<string>
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
      placeholder={t('search.trackPlaceholder')}
      clearLabel={t('search.clear')}
      emptyLabel={t('search.trackEmpty')}
      errorLabel={(error) =>
        isSpotifyRateLimited(error)
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
    />
  )
}

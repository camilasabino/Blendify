import { api, getApiErrorMessage, isRequestLimited, isSpotifyRateLimited, type Artist } from '@/lib/api'
import { SpotifyLink } from '@/components/brand/spotify-link'
import { SearchCombobox } from '@/components/ui/search-combobox'
import { useT } from '@/i18n/use-t'

type ArtistSearchProps = Readonly<{
  selectedIds: Set<string>
  inputId?: string
  onSelect: (artist: Artist) => void
  disabled?: boolean
  className?: string
}>

export function ArtistSearch(props: ArtistSearchProps) {
  const t = useT()

  return (
    <SearchCombobox
      queryKey="artists"
      search={async (query) => (await api.searchArtists(query)).artists}
      selectedIds={props.selectedIds}
      onSelect={props.onSelect}
      inputId={props.inputId}
      placeholder={t('search.placeholder')}
      resultsLabel={t('search.artistResults')}
      clearLabel={t('search.clear')}
      emptyLabel={t('search.empty')}
      errorLabel={(error) =>
        isSpotifyRateLimited(error) || isRequestLimited(error)
          ? getApiErrorMessage(error, t, 'search.rateLimited')
          : t('search.error')
      }
      disabled={props.disabled}
      className={props.className}
      renderOption={(artist, selected) => (
        <>
          {artist.imageUrl ? (
            <img
              src={artist.imageUrl}
              alt=""
              className="size-8 rounded-full object-cover"
            />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-charcoal-600 text-xs text-cream-200">
              {artist.name.slice(0, 1)}
            </span>
          )}
          <span className="truncate text-sm text-cream-50">{artist.name}</span>
          {selected ? (
            <span className="ml-auto shrink-0 text-xs text-cream-400">
              {t('search.added')}
            </span>
          ) : null}
        </>
      )}
      renderOptionAction={(artist) => (
        <SpotifyLink
          href={artist.externalUrl}
          label={t('spotify.openArtist', { name: artist.name })}
        />
      )}
    />
  )
}

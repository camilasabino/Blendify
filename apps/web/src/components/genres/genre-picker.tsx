import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Sparkles } from 'lucide-react'
import { api, type CuratedGenre } from '@/lib/api'
import {
  RemovableChip,
  SeedChip,
  SelectableChip,
} from '@/components/ui/chip'
import { FieldError } from '@/components/ui/feedback'
import { SearchField } from '@/components/ui/search-field'
import { Spinner } from '@/components/ui/spinner'
import { useSuggestionSeed } from '@/hooks/use-suggestion-seed'
import { useT } from '@/i18n/use-t'
import { cn, focusRing } from '@/lib/utils'

const EXPLORE_PAGE_SIZE = 8

type GenrePickerProps = {
  selected: CuratedGenre[]
  max: number
  onToggle: (genre: CuratedGenre) => void
  onRemove: (id: string) => void
  onClear?: () => void
  className?: string
}

export function GenrePicker({
  selected,
  max,
  onToggle,
  onRemove,
  onClear,
  className,
}: GenrePickerProps) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [explorePage, setExplorePage] = useState(0)
  const [exploreItems, setExploreItems] = useState<CuratedGenre[]>([])
  const { seed, setSeedId } = useSuggestionSeed(selected)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const selectedIdsKey = selected.map((g) => g.id).join(',')
  const searching = debounced.length >= 1

  useEffect(() => {
    setExplorePage(0)
    setExploreItems([])
  }, [seed?.id, debounced])

  const catalogQuery = useQuery({
    queryKey: ['genres', 'catalog'],
    queryFn: api.listGenres,
  })

  const searchQuery = useQuery({
    queryKey: ['genres', 'search', debounced],
    queryFn: () =>
      api.searchGenres(debounced, {
        offset: 0,
        limit: EXPLORE_PAGE_SIZE * 2,
      }),
    enabled: searching,
    placeholderData: (previous) => previous,
  })

  const exploreRequestIds = useMemo(() => {
    if (!seed) return []
    const ids = selected.map((g) => g.id)
    return [...ids.filter((id) => id !== seed.id), seed.id]
  }, [selected, seed])

  const exploreQuery = useQuery({
    queryKey: ['genres', 'explore', seed?.id, selectedIdsKey, explorePage],
    queryFn: () =>
      api.exploreGenres(exploreRequestIds, {
        offset: explorePage * EXPLORE_PAGE_SIZE,
        limit: EXPLORE_PAGE_SIZE,
      }),
    enabled: selected.length > 0 && !searching && Boolean(seed),
  })

  const selectedIds = useMemo(
    () => new Set(selected.map((g) => g.id)),
    [selected],
  )

  useEffect(() => {
    const batch = exploreQuery.data?.genres
    if (!batch || searching) return
    setExploreItems((prev) => {
      const nextBatch = batch.filter((g) => !selectedIds.has(g.id))
      if (explorePage === 0) return nextBatch
      const seen = new Set(prev.map((g) => g.id))
      return [...prev, ...nextBatch.filter((g) => !seen.has(g.id))]
    })
  }, [exploreQuery.data, explorePage, selectedIds, searching])

  const catalog = catalogQuery.data?.genres ?? []
  const searchResults = searchQuery.data?.genres ?? []
  const visible = searching ? searchResults : catalog

  const explore = exploreItems.filter((g) => !selectedIds.has(g.id))

  const exploreHasMore = exploreQuery.data?.hasMore ?? false
  const exploreFetching = exploreQuery.isFetching

  const atLimit = selected.length >= max
  const showExplore = selected.length > 0 && !atLimit && !searching && Boolean(seed)

  function selectGenre(genre: CuratedGenre) {
    onToggle(genre)
    setQuery('')
    setDebounced('')
    setExplorePage(0)
    setExploreItems([])
  }

  return (
    <div className={cn('space-y-4', className)}>
      <SearchField
        value={query}
        onChange={(value) => {
          setQuery(value)
          if (!value) setDebounced('')
        }}
        placeholder={t('genre.searchPlaceholder')}
        clearLabel={t('search.clear')}
        loading={catalogQuery.isFetching || exploreFetching}
      />

      {selected.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-end">
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                className={cn(
                  'text-xs text-cream-400 transition-colors hover:text-cream-200',
                  focusRing,
                )}
              >
                {t('create.clearAll')}
              </button>
            )}
          </div>
          <ul className="flex flex-wrap gap-2">
            {selected.map((genre) => (
              <RemovableChip
                key={genre.id}
                label={genre.name}
                highlighted={seed?.id === genre.id}
                onRemove={() => onRemove(genre.id)}
                removeLabel={t('genre.remove', { name: genre.name })}
              />
            ))}
          </ul>
        </div>
      )}

      {catalogQuery.isError && (
        <FieldError>{t('genre.loadError')}</FieldError>
      )}

      {!catalogQuery.isError && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-cream-400">
            {searching ? t('genre.results') : t('genre.mains')}
          </p>
          <div className="flex flex-wrap gap-2">
            {visible.map((genre) => {
              const isSelected = selectedIds.has(genre.id)
              return (
                <SelectableChip
                  key={genre.id}
                  selected={isSelected}
                  disabled={!isSelected && atLimit}
                  onClick={() => selectGenre(genre)}
                >
                  {genre.name}
                </SelectableChip>
              )
            })}
            {searching &&
              !searchQuery.isFetching &&
              searchResults.length === 0 && (
                <p className="text-sm text-cream-400">{t('genre.empty')}</p>
              )}
          </div>
          {searching && searchResults.some((g) => g.id.startsWith('custom:')) ? (
            <p className="text-xs text-cream-500">{t('genre.customHint')}</p>
          ) : null}
        </div>
      )}

      {showExplore && seed && (
        <div className="space-y-2 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-amber-400/90">
            <Sparkles className="size-3.5" />
            {t('genre.exploreFor', { query: seed.name })}
            {exploreFetching && <Spinner size="sm" />}
          </div>
          <p className="text-xs text-cream-400">{t('genre.exploreHint')}</p>

          {selected.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-cream-500">
                {t('genre.exploreSeedHint')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selected.map((genre) => (
                  <SeedChip
                    key={genre.id}
                    active={genre.id === seed.id}
                    onClick={() => setSeedId(genre.id)}
                  >
                    {genre.name}
                  </SeedChip>
                ))}
              </div>
            </div>
          )}

          {explore.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {explore.map((genre) => (
                <SelectableChip
                  key={genre.id}
                  selected={false}
                  disabled={atLimit}
                  onClick={() => selectGenre(genre)}
                >
                  {genre.name}
                </SelectableChip>
              ))}
            </div>
          ) : (
            !exploreFetching && (
              <p className="text-sm text-cream-400">
                {t('genre.exploreEmpty')}
              </p>
            )
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {exploreHasMore ? (
              <button
                type="button"
                onClick={() => setExplorePage((p) => p + 1)}
                disabled={exploreFetching}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 transition-colors hover:text-amber-300 disabled:opacity-50',
                  focusRing,
                )}
              >
                <RefreshCw
                  className={cn(
                    'size-3.5',
                    exploreFetching && 'animate-spin',
                  )}
                />
                {t('genre.suggestMore')}
              </button>
            ) : (
              explore.length > 0 && (
                <p className="text-xs text-cream-500">
                  {t('genre.exploreExhausted')}
                </p>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

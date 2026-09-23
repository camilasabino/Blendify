import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, RefreshCw, Sparkles } from 'lucide-react'
import { api, type CuratedGenre } from '@/lib/api'
import { GenreIcon } from '@/components/genres/genre-icon'
import {
  ClearAllButton,
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

type GenrePickerProps = Readonly<{
  selected: CuratedGenre[]
  max: number
  onToggle: (genre: CuratedGenre) => void
  onRemove: (id: string) => void
  onClear?: () => void
  className?: string
}>

function SelectedGenres({
  selected,
  seedId,
  onRemove,
  onClear,
}: Readonly<{
  selected: CuratedGenre[]
  seedId: string | undefined
  onRemove: (id: string) => void
  onClear?: () => void
}>) {
  const t = useT()
  if (selected.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        {onClear ? (
          <ClearAllButton onClick={onClear}>
            {t('create.clearAll')}
          </ClearAllButton>
        ) : null}
      </div>
      <ul className="flex flex-wrap gap-2">
        {selected.map((genre) => (
          <RemovableChip
            key={genre.id}
            label={genre.name}
            highlighted={seedId === genre.id}
            leading={<GenreIcon name={genre.name} id={genre.id} />}
            onRemove={() => onRemove(genre.id)}
            removeLabel={t('genre.remove', { name: genre.name })}
          />
        ))}
      </ul>
    </div>
  )
}

function GenreCatalogResults({
  searching,
  visible,
  selectedIds,
  atLimit,
  searchFetching,
  searchEmpty,
  onSelect,
}: Readonly<{
  searching: boolean
  visible: CuratedGenre[]
  selectedIds: Set<string>
  atLimit: boolean
  searchFetching: boolean
  searchEmpty: boolean
  onSelect: (genre: CuratedGenre) => void
}>) {
  const t = useT()
  return (
    <div className="space-y-2">
      <h3 className="font-sans text-sm font-medium text-cream-300">
        {searching ? t('genre.results') : t('genre.mains')}
      </h3>
      <div className="flex flex-wrap gap-2">
        {visible.map((genre) => {
          const isSelected = selectedIds.has(genre.id)
          return (
            <SelectableChip
              key={genre.id}
              selected={isSelected}
              disabled={!isSelected && atLimit}
              onClick={() => onSelect(genre)}
            >
              {genre.name}
            </SelectableChip>
          )
        })}
        {searching && !searchFetching && searchEmpty ? (
          <p className="text-sm text-cream-400">{t('genre.empty')}</p>
        ) : null}
      </div>
    </div>
  )
}

function GenreExploreSection({
  seed,
  selected,
  explore,
  explorePage,
  exploreLoading,
  exploreFetching,
  exploreHasMore,
  atLimit,
  onSetSeedId,
  onSelect,
  onLoadMore,
}: Readonly<{
  seed: CuratedGenre
  selected: CuratedGenre[]
  explore: CuratedGenre[]
  explorePage: number
  exploreLoading: boolean
  exploreFetching: boolean
  exploreHasMore: boolean
  atLimit: boolean
  onSetSeedId: (id: string) => void
  onSelect: (genre: CuratedGenre) => void
  onLoadMore: () => void
}>) {
  const t = useT()
  const showLoadMore = exploreHasMore || explore.length > 0
  const emptyLabel =
    explorePage > 0 ? t('genre.exploreExhausted') : t('genre.exploreEmpty')

  return (
    <div className="space-y-3 rounded-2xl border border-amber-500/15 bg-gradient-to-b from-amber-500/[0.07] to-transparent p-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 font-sans text-sm font-medium text-amber-300/90">
          <Sparkles aria-hidden className="size-3.5" />
          {t('genre.exploreFor', { query: seed.name })}
        </h3>
        <p className="text-sm leading-relaxed text-cream-400">
          {t('genre.exploreHint')}
        </p>
      </div>

      {selected.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-cream-500">
            {t('genre.exploreSeedHint')}
          </span>
          {selected.map((genre) => (
            <SeedChip
              key={genre.id}
              active={genre.id === seed.id}
              onClick={() => onSetSeedId(genre.id)}
            >
              {genre.name}
            </SeedChip>
          ))}
        </div>
      ) : null}

      {exploreLoading ? (
        <div className="flex items-center gap-2 py-2 text-sm text-cream-400">
          <Spinner size="sm" />
          {t('common.loading')}
        </div>
      ) : null}

      {!exploreLoading && explore.length === 0 ? (
        <p className="text-sm text-cream-400">{emptyLabel}</p>
      ) : null}

      {explore.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {explore.map((genre) => (
            <li key={genre.id}>
              <button
                type="button"
                disabled={atLimit}
                onClick={() => onSelect(genre)}
                className={cn(
                  'group inline-flex max-w-full items-center gap-2 rounded-full border border-cream-200/10 bg-charcoal-950/35 px-3.5 py-2 text-left text-sm text-cream-100 transition',
                  'hover:border-amber-500/35 hover:bg-amber-500/10 hover:text-cream-50',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  focusRing,
                )}
              >
                <span className="truncate font-medium tracking-tight">
                  {genre.name}
                </span>
                <Plus className="size-3.5 shrink-0 text-amber-400/70 transition group-hover:text-amber-300" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showLoadMore ? (
        <button
          type="button"
          disabled={exploreFetching || !exploreHasMore}
          onClick={onLoadMore}
          className={cn(
            'inline-flex items-center gap-2 text-sm text-amber-300/90 transition hover:text-amber-200 disabled:opacity-40',
            focusRing,
          )}
        >
          {exploreFetching ? (
            <Spinner size="sm" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {exploreHasMore
            ? t('genre.suggestMore')
            : t('genre.exploreExhausted')}
        </button>
      ) : null}
    </div>
  )
}

function mergeExploreBatch(
  prev: CuratedGenre[],
  batch: CuratedGenre[],
  selectedIds: Set<string>,
  explorePage: number,
): CuratedGenre[] {
  const nextBatch = batch.filter((g) => !selectedIds.has(g.id))
  if (explorePage === 0) return nextBatch
  const seen = new Set(prev.map((g) => g.id))
  return [...prev, ...nextBatch.filter((g) => !seen.has(g.id))]
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
    staleTime: 120_000,
  })

  const selectedIds = useMemo(
    () => new Set(selected.map((g) => g.id)),
    [selected],
  )

  useEffect(() => {
    const batch = exploreQuery.data?.genres
    if (!batch || searching) return
    setExploreItems((prev) =>
      mergeExploreBatch(prev, batch, selectedIds, explorePage),
    )
  }, [exploreQuery.data, explorePage, selectedIds, searching])

  const catalog = catalogQuery.data?.genres ?? []
  const searchResults = searchQuery.data?.genres ?? []
  const visible = searching ? searchResults : catalog
  const explore = exploreItems.filter((g) => !selectedIds.has(g.id))
  const atLimit = selected.length >= max
  const showExplore =
    selected.length > 0 && !atLimit && !searching && Boolean(seed)

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
        loading={catalogQuery.isFetching || (searching && searchQuery.isFetching)}
      />

      <SelectedGenres
        selected={selected}
        seedId={seed?.id}
        onRemove={onRemove}
        onClear={onClear}
      />

      {catalogQuery.isError ? (
        <FieldError>{t('genre.loadError')}</FieldError>
      ) : (
        <GenreCatalogResults
          searching={searching}
          visible={visible}
          selectedIds={selectedIds}
          atLimit={atLimit}
          searchFetching={searchQuery.isFetching}
          searchEmpty={searchResults.length === 0}
          onSelect={selectGenre}
        />
      )}

      {showExplore && seed ? (
        <GenreExploreSection
          seed={seed}
          selected={selected}
          explore={explore}
          explorePage={explorePage}
          exploreLoading={exploreQuery.isLoading}
          exploreFetching={exploreQuery.isFetching}
          exploreHasMore={exploreQuery.data?.hasMore ?? false}
          atLimit={atLimit}
          onSetSeedId={setSeedId}
          onSelect={selectGenre}
          onLoadMore={() => setExplorePage((p) => p + 1)}
        />
      ) : null}
    </div>
  )
}

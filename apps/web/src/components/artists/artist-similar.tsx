import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Plus, RefreshCw, Sparkles } from 'lucide-react'
import {
  api,
  getApiErrorMessage,
  type Artist,
  type SimilarArtistSuggestion,
} from '@/lib/api'
import { SeedChip } from '@/components/ui/chip'
import { FieldError } from '@/components/ui/feedback'
import { Spinner } from '@/components/ui/spinner'
import { useSuggestionSeed } from '@/hooks/use-suggestion-seed'
import { useT } from '@/i18n/use-t'
import { cn, focusRing, normalizeArtistName } from '@/lib/utils'

const PAGE_SIZE = 8

type ArtistSimilarProps = Readonly<{
  selected: Artist[]
  max: number
  onSelect: (artist: Artist) => void
  className?: string
}>

function mergeSimilarBatch(
  prev: SimilarArtistSuggestion[],
  batch: SimilarArtistSuggestion[],
  selectedNames: Set<string>,
  page: number,
): SimilarArtistSuggestion[] {
  const nextBatch = batch.filter(
    (artist) => !selectedNames.has(normalizeArtistName(artist.name)),
  )
  if (page === 0) return nextBatch
  const seen = new Set(prev.map((artist) => normalizeArtistName(artist.name)))
  return [
    ...prev,
    ...nextBatch.filter(
      (artist) => !seen.has(normalizeArtistName(artist.name)),
    ),
  ]
}

function ExploreSeedPicker({
  selected,
  seedId,
  onSetSeedId,
}: Readonly<{
  selected: Artist[]
  seedId: string
  onSetSeedId: (id: string) => void
}>) {
  const t = useT()
  if (selected.length <= 1) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-cream-400">
        {t('artist.exploreSeedHint')}
      </span>
      {selected.map((artist) => (
        <SeedChip
          key={artist.id}
          active={artist.id === seedId}
          onClick={() => onSetSeedId(artist.id)}
        >
          {artist.name}
        </SeedChip>
      ))}
    </div>
  )
}

function SimilarSuggestionsList({
  suggestions,
  resolvingName,
  resolvePending,
  onResolve,
}: Readonly<{
  suggestions: SimilarArtistSuggestion[]
  resolvingName: string | null
  resolvePending: boolean
  onResolve: (name: string) => void
}>) {
  const t = useT()
  if (suggestions.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2">
      {suggestions.map((artist) => {
        const busy = resolvingName === artist.name
        return (
          <li key={`${artist.mbid ?? artist.name}`}>
            <button
              type="button"
              disabled={resolvePending}
              onClick={() => onResolve(artist.name)}
              aria-label={t('create.addSuggestion', { name: artist.name })}
              className={cn(
                'group inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-divider bg-field px-3.5 py-1.5 text-left text-sm text-cream-100 transition-colors',
                'hover:border-control-hover hover:bg-hover hover:text-cream-50',
                'disabled:cursor-wait disabled:opacity-60',
                focusRing,
              )}
            >
              <span className="truncate font-medium tracking-tight">
                {artist.name}
              </span>
              {busy ? (
                <Spinner size="sm" className="shrink-0" />
              ) : (
                <Plus aria-hidden className="size-3.5 shrink-0 text-accent-fg" />
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function SuggestMoreButton({
  hasMore,
  fetching,
  onLoadMore,
}: Readonly<{
  hasMore: boolean
  fetching: boolean
  onLoadMore: () => void
}>) {
  const t = useT()
  return (
    <button
      type="button"
      disabled={fetching || !hasMore}
      onClick={onLoadMore}
      className={cn(
        'inline-flex min-h-8 items-center gap-2 rounded-control text-sm font-medium text-accent-fg transition-colors hover:text-amber-300 disabled:opacity-50',
        focusRing,
      )}
    >
      {fetching ? (
        <Spinner size="sm" />
      ) : (
        <RefreshCw aria-hidden className="size-3.5" />
      )}
      {hasMore ? t('artist.suggestMore') : t('artist.exploreExhausted')}
    </button>
  )
}

export function ArtistSimilarSuggestions({
  selected,
  max,
  onSelect,
  className,
}: ArtistSimilarProps) {
  const t = useT()
  const atLimit = selected.length >= max
  const [page, setPage] = useState(0)
  const [items, setItems] = useState<SimilarArtistSuggestion[]>([])
  const [resolveError, setResolveError] = useState<string | null>(null)
  const { seed, setSeedId } = useSuggestionSeed(selected)

  const selectedNames = useMemo(
    () => new Set(selected.map((artist) => normalizeArtistName(artist.name))),
    [selected],
  )

  useEffect(() => {
    setPage(0)
    setItems([])
    setResolveError(null)
  }, [seed?.id])

  const excludeNames = useMemo(
    () => selected.map((artist) => artist.name),
    [selected],
  )

  const seedName = seed?.name
  const similarQuery = useQuery({
    queryKey: ['artists', 'similar', seedName, page, excludeNames.join('|')],
    queryFn: () => {
      if (!seedName) {
        return Promise.resolve({
          artists: [] as SimilarArtistSuggestion[],
          hasMore: false,
          source: 'lastfm' as const,
        })
      }
      return api.similarArtists(seedName, {
        excludeNames,
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      })
    },
    enabled: Boolean(seedName) && !atLimit,
    staleTime: 120_000,
    retry: false,
  })

  useEffect(() => {
    const batch = similarQuery.data?.artists
    if (!batch) return
    setItems((prev) => mergeSimilarBatch(prev, batch, selectedNames, page))
  }, [similarQuery.data, page, selectedNames])

  const resolveMutation = useMutation({
    mutationFn: async (name: string) => {
      const { artists } = await api.resolveArtists([name])
      return artists[0] ?? null
    },
    onMutate: () => setResolveError(null),
    onSuccess: (artist) => {
      if (!artist) {
        setResolveError(t('artist.exploreResolveError'))
        return
      }
      onSelect(artist)
    },
    onError: (error) => {
      setResolveError(
        getApiErrorMessage(error, t, 'artist.exploreResolveError'),
      )
    },
  })

  const suggestions = items.filter(
    (artist) => !selectedNames.has(normalizeArtistName(artist.name)),
  )
  const hasMore = similarQuery.data?.hasMore ?? false
  const resolvingName = resolveMutation.isPending
    ? (resolveMutation.variables ?? null)
    : null
  const showLoadMore = hasMore || suggestions.length > 0
  const emptyLabel =
    page > 0 ? t('artist.exploreExhausted') : t('artist.exploreEmpty')

  if (selected.length === 0 || atLimit || !seed) return null

  return (
    <div
      className={cn(
        'space-y-3 rounded-card border border-divider bg-card p-4',
        className,
      )}
    >
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 font-sans text-sm font-semibold text-cream-100">
          <Sparkles aria-hidden className="size-4 shrink-0 text-accent-fg" />
          {selected.length > 1
            ? t('create.suggestions')
            : t('create.suggestionsFor', { name: seed.name })}
        </h3>
        <p className="text-sm leading-relaxed text-cream-400">
          {t('create.suggestionsHint')}
        </p>
      </div>

      <ExploreSeedPicker
        selected={selected}
        seedId={seed.id}
        onSetSeedId={setSeedId}
      />

      {similarQuery.isLoading ? (
        <div className="flex items-center gap-2 py-2 text-sm text-cream-400">
          <Spinner size="sm" />
          {t('common.loading')}
        </div>
      ) : null}

      {similarQuery.isError ? (
        <FieldError>
          {getApiErrorMessage(similarQuery.error, t, 'artist.exploreError')}
        </FieldError>
      ) : null}

      {resolveError ? <FieldError>{resolveError}</FieldError> : null}

      {!similarQuery.isLoading && suggestions.length === 0 ? (
        <p className="text-sm text-cream-400">{emptyLabel}</p>
      ) : null}

      <SimilarSuggestionsList
        suggestions={suggestions}
        resolvingName={resolvingName}
        resolvePending={resolveMutation.isPending}
        onResolve={(name) => resolveMutation.mutate(name)}
      />

      {showLoadMore ? (
        <SuggestMoreButton
          hasMore={hasMore}
          fetching={similarQuery.isFetching}
          onLoadMore={() => setPage((p) => p + 1)}
        />
      ) : null}
    </div>
  )
}

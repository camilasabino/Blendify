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

type ArtistSimilarProps = {
  selected: Artist[]
  max: number
  onSelect: (artist: Artist) => void
  className?: string
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
    setItems((prev) => {
      const nextBatch = batch.filter(
        (artist) => !selectedNames.has(normalizeArtistName(artist.name)),
      )
      if (page === 0) return nextBatch
      const seen = new Set(
        prev.map((artist) => normalizeArtistName(artist.name)),
      )
      return [
        ...prev,
        ...nextBatch.filter(
          (artist) => !seen.has(normalizeArtistName(artist.name)),
        ),
      ]
    })
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

  if (selected.length === 0 || atLimit || !seed) return null

  return (
    <div
      className={cn(
        'space-y-3 rounded-2xl border border-amber-500/15 bg-gradient-to-b from-amber-500/[0.07] to-transparent p-4',
        className,
      )}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-amber-400/90">
          <Sparkles className="size-3.5" />
          {t('artist.exploreFor', { name: seed.name })}
        </div>
        <p className="text-sm leading-relaxed text-cream-400">
          {t('artist.exploreHint')}
        </p>
      </div>

      {selected.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-cream-500">
            {t('artist.exploreSeedHint')}
          </span>
          {selected.map((artist) => (
            <SeedChip
              key={artist.id}
              active={artist.id === seed.id}
              onClick={() => setSeedId(artist.id)}
            >
              {artist.name}
            </SeedChip>
          ))}
        </div>
      ) : null}

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
        <p className="text-sm text-cream-400">
          {page > 0 ? t('artist.exploreExhausted') : t('artist.exploreEmpty')}
        </p>
      ) : null}

      {suggestions.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {suggestions.map((artist) => {
            const busy = resolvingName === artist.name
            return (
              <li key={`${artist.mbid ?? artist.name}`}>
                <button
                  type="button"
                  disabled={resolveMutation.isPending}
                  onClick={() => resolveMutation.mutate(artist.name)}
                  className={cn(
                    'group inline-flex max-w-full items-center gap-2 rounded-full border border-cream-200/10 bg-charcoal-950/35 px-3.5 py-2 text-left text-sm text-cream-100 transition',
                    'hover:border-amber-500/35 hover:bg-amber-500/10 hover:text-cream-50',
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
                    <Plus className="size-3.5 shrink-0 text-amber-400/70 transition group-hover:text-amber-300" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {hasMore || suggestions.length > 0 ? (
        <button
          type="button"
          disabled={similarQuery.isFetching || !hasMore}
          onClick={() => setPage((p) => p + 1)}
          className={cn(
            'inline-flex items-center gap-2 text-sm text-amber-300/90 transition hover:text-amber-200 disabled:opacity-40',
            focusRing,
          )}
        >
          {similarQuery.isFetching ? (
            <Spinner size="sm" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {hasMore ? t('artist.suggestMore') : t('artist.exploreExhausted')}
        </button>
      ) : null}
    </div>
  )
}

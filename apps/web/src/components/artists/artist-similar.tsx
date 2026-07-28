import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Sparkles } from 'lucide-react'
import { api, type Artist } from '@/lib/api'
import { SeedChip } from '@/components/ui/chip'
import { FieldError } from '@/components/ui/feedback'
import { Spinner } from '@/components/ui/spinner'
import { useSuggestionSeed } from '@/hooks/use-suggestion-seed'
import { useT } from '@/i18n/use-t'
import { cn, focusRing } from '@/lib/utils'

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
  const selectedIds = selected.map((a) => a.id)
  const atLimit = selected.length >= max
  const [page, setPage] = useState(0)
  const [items, setItems] = useState<Artist[]>([])
  const [opened, setOpened] = useState(false)
  const { seed, setSeedId } = useSuggestionSeed(selected)

  useEffect(() => {
    setPage(0)
    setItems([])
    setOpened(false)
  }, [seed?.id])

  const requestIds = useMemo(() => {
    if (!seed) return []
        return [...selectedIds.filter((id) => id !== seed.id), seed.id]
  }, [selectedIds, seed])

  const similarQuery = useQuery({
    queryKey: ['artists', 'similar', seed?.id, page],
    queryFn: () =>
      api.similarArtists(requestIds, {
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      }),
        enabled: opened && Boolean(seed) && !atLimit,
    staleTime: 120_000,
    retry: false,
  })

  useEffect(() => {
    const batch = similarQuery.data?.artists
    if (!batch) return
    setItems((prev) => {
      const exclude = new Set(selectedIds)
      const nextBatch = batch.filter((artist) => !exclude.has(artist.id))
      if (page === 0) return nextBatch
      const seen = new Set(prev.map((a) => a.id))
      return [...prev, ...nextBatch.filter((a) => !seen.has(a.id))]
    })
  }, [similarQuery.data, page, selectedIds])

  const suggestions = items.filter((artist) => !selectedIds.includes(artist.id))
  const hasMore = similarQuery.data?.hasMore ?? false

  if (selected.length === 0 || atLimit || !seed) return null

  return (
    <div
      className={cn(
        'space-y-2 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-amber-400/90">
        <Sparkles className="size-3.5" />
        {t('artist.exploreFor', { name: seed.name })}
      </div>
      <p className="text-xs text-cream-400">{t('artist.exploreHint')}</p>

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

      {!opened ? (
        <button
          type="button"
          onClick={() => setOpened(true)}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-100 transition hover:bg-amber-500/25',
            focusRing,
          )}
        >
          <Sparkles className="size-3.5" />
          {t('artist.exploreOpen')}
        </button>
      ) : null}

      {opened && similarQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-cream-400">
          <Spinner size="sm" />
          {t('common.loading')}
        </div>
      ) : null}

      {opened && similarQuery.isError ? (
        <FieldError>{t('artist.exploreError')}</FieldError>
      ) : null}

      {opened && !similarQuery.isLoading && suggestions.length === 0 ? (
        <p className="text-sm text-cream-400">
          {page > 0 ? t('artist.exploreExhausted') : t('artist.exploreEmpty')}
        </p>
      ) : null}

      {suggestions.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {suggestions.map((artist) => (
            <li key={artist.id}>
              <button
                type="button"
                onClick={() => onSelect(artist)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg bg-charcoal-950/40 px-2 py-1.5 text-left text-sm transition hover:bg-charcoal-900/80',
                  focusRing,
                )}
              >
                {artist.imageUrl ? (
                  <img
                    src={artist.imageUrl}
                    alt=""
                    className="size-8 rounded-full object-cover"
                  />
                ) : (
                  <span className="size-8 rounded-full bg-charcoal-800" />
                )}
                <span className="truncate text-cream-100">{artist.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {opened && (hasMore || suggestions.length > 0) ? (
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

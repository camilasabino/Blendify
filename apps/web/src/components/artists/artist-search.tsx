import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { api, getApiErrorMessage, isSpotifyRateLimited, type Artist } from '@/lib/api'
import { FieldError } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useT } from '@/i18n/use-t'
import { cn, focusRing } from '@/lib/utils'

type ArtistSearchProps = {
  selectedIds: Set<string>
  onSelect: (artist: Artist) => void
  disabled?: boolean
  className?: string
}

export function ArtistSearch({
  selectedIds,
  onSelect,
  disabled,
  className,
}: ArtistSearchProps) {
  const t = useT()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 600)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['artists', 'search', debounced],
    queryFn: () => api.searchArtists(debounced),
    enabled: debounced.length >= 2,
    retry: false,
    staleTime: 60_000,
  })

  const artists = data?.artists ?? []
  const rateLimited = isSpotifyRateLimited(error)
  const errorMessage = rateLimited
    ? getApiErrorMessage(error, t, 'search.rateLimited')
    : t('search.error')

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cream-400" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={t('search.placeholder')}
          disabled={disabled}
          className={cn('pl-9', query ? 'pr-9' : undefined)}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
        />
        {query && !isFetching ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setDebounced('')
              setOpen(false)
            }}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-cream-400 transition-colors hover:bg-charcoal-700 hover:text-cream-100',
              focusRing,
            )}
            aria-label={t('search.clear')}
          >
            <X className="size-4" />
          </button>
        ) : null}
        {isFetching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner size="sm" />
          </span>
        )}
      </div>

      {open && debounced.length >= 2 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-cream-200/10 bg-charcoal-800 py-1 shadow-xl animate-fade-in"
        >
          {isError && (
            <li className="px-3 py-2">
              <FieldError>{errorMessage}</FieldError>
            </li>
          )}
          {!isError && !isFetching && artists.length === 0 && (
            <li className="px-3 py-2 text-sm text-cream-400">
              {t('search.empty')}
            </li>
          )}
          {artists.map((artist) => {
            const selected = selectedIds.has(artist.id)
            return (
              <li key={artist.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  disabled={selected || disabled}
                  onClick={() => {
                    onSelect(artist)
                    setQuery('')
                    setDebounced('')
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150',
                    selected
                      ? 'cursor-default opacity-40'
                      : 'hover:bg-amber-500/10',
                  )}
                >
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
                  <span className="truncate text-sm text-cream-50">
                    {artist.name}
                  </span>
                  {selected && (
                    <span className="ml-auto text-xs text-cream-400">
                      {t('search.added')}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

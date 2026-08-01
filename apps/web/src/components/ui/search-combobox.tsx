import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { FieldError } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { cn, focusRing } from '@/lib/utils'

export function SearchCombobox<T extends { id: string }>({
  queryKey,
  search,
  selectedIds,
  onSelect,
  renderOption,
  placeholder,
  clearLabel,
  emptyLabel,
  errorLabel,
  disabled,
  className,
}: Readonly<{
  queryKey: string
  search: (query: string) => Promise<T[]>
  selectedIds: Set<string>
  onSelect: (item: T) => void
  renderOption: (item: T, selected: boolean) => ReactNode
  placeholder: string
  clearLabel: string
  emptyLabel: string
  errorLabel: (error: unknown) => string
  disabled?: boolean
  className?: string
}>) {
  const inputId = useId()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 600)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  const result = useQuery({
    queryKey: [queryKey, 'search', debounced],
    queryFn: () => search(debounced),
    enabled: debounced.length >= 2,
    retry: false,
    staleTime: 60_000,
  })
  const items = result.data ?? []
  const selectable = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !selectedIds.has(item.id))

  useEffect(() => setActiveIndex(-1), [debounced, items.length])

  function clear() {
    setQuery('')
    setDebounced('')
    setOpen(false)
    setActiveIndex(-1)
  }

  function select(item: T) {
    if (selectedIds.has(item.id) || disabled) return
    onSelect(item)
    clear()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open || selectable.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => {
        const position = selectable.findIndex(({ index }) => index === current)
        if (position < 0) {
          return delta > 0
            ? selectable[0].index
            : selectable.at(-1)!.index
        }
        const next = (position + delta + selectable.length) % selectable.length
        return selectable[next].index
      })
      return
    }
    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      const item = items[activeIndex]
      if (item) select(item)
    }
  }

  const showResults = open && debounced.length >= 2

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cream-400" />
        <Input
          id={inputId}
          role="combobox"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn('pl-9', query ? 'pr-9' : undefined)}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={showResults}
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
          }
        />
        {query && !result.isFetching ? (
          <button
            type="button"
            onClick={clear}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-cream-400 transition-colors hover:bg-charcoal-700 hover:text-cream-100',
              focusRing,
            )}
            aria-label={clearLabel}
          >
            <X className="size-4" />
          </button>
        ) : null}
        {result.isFetching ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner size="sm" />
          </span>
        ) : null}
      </div>
      {showResults ? (
        <ul
          id={listId}
          className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-cream-200/10 bg-charcoal-800 py-1 shadow-xl animate-fade-in"
        >
          {result.isError ? (
            <li className="px-3 py-2">
              <FieldError>{errorLabel(result.error)}</FieldError>
            </li>
          ) : null}
          {!result.isError && !result.isFetching && items.length === 0 ? (
            <li className="px-3 py-2 text-sm text-cream-400">{emptyLabel}</li>
          ) : null}
          {items.map((item, index) => {
            const selected = selectedIds.has(item.id)
            const active = index === activeIndex
            return (
              <li
                id={`${listId}-option-${index}`}
                key={item.id}
                role="option"
                aria-selected={active}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  disabled={selected || disabled}
                  onMouseEnter={() => !selected && setActiveIndex(index)}
                  onClick={() => select(item)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150',
                    selected && 'cursor-default opacity-40',
                    active && !selected && 'bg-amber-500/10',
                  )}
                >
                  {renderOption(item, selected)}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

import {
  useEffect,
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { FieldError } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useT } from '@/i18n/use-t'
import { cn, focusRing } from '@/lib/utils'

function comboboxStatus({
  showPopup,
  isError,
  isFetching,
  error,
  itemCount,
  emptyLabel,
  errorLabel,
  t,
}: Readonly<{
  showPopup: boolean
  isError: boolean
  isFetching: boolean
  error: unknown
  itemCount: number
  emptyLabel: string
  errorLabel: (error: unknown) => string
  t: ReturnType<typeof useT>
}>): string {
  if (!showPopup) return ''
  if (isError) return errorLabel(error)
  if (isFetching) return ''
  if (itemCount === 0) return emptyLabel
  if (itemCount === 1) return t('search.resultsOne')
  return t('search.resultsMany', { count: itemCount })
}

function SearchComboboxOptions<T extends { id: string }>({
  isError,
  isFetching,
  items,
  emptyLabel,
  errorLabel,
  error,
  listId,
  resultsLabel,
  showOptions,
  optionId,
  selectedIds,
  activeIndex,
  disabled,
  onHover,
  onSelect,
  renderOption,
}: Readonly<{
  isError: boolean
  isFetching: boolean
  items: T[]
  emptyLabel: string
  errorLabel: (error: unknown) => string
  error: unknown
  listId: string
  resultsLabel: string
  showOptions: boolean
  optionId: (index: number) => string
  selectedIds: Set<string>
  activeIndex: number
  disabled?: boolean
  onHover: (index: number) => void
  onSelect: (item: T) => void
  renderOption: (item: T, selected: boolean) => ReactNode
}>) {
  return (
    <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-card border border-divider bg-raised py-1 shadow-xl shadow-charcoal-950/60 animate-fade-in">
      {isError ? (
        <div className="px-3 py-2">
          <FieldError>{errorLabel(error)}</FieldError>
        </div>
      ) : null}
      {!isError && !isFetching && items.length === 0 ? (
        <p className="px-3 py-2 text-sm text-cream-400">{emptyLabel}</p>
      ) : null}
      <ul id={listId} role="listbox" aria-label={resultsLabel} hidden={!showOptions}>
        {items.map((item, index) => {
          const selected = selectedIds.has(item.id)
          const active = index === activeIndex
          return (
            <li
              id={optionId(index)}
              key={item.id}
              role="option"
              aria-selected={active}
              aria-disabled={selected || disabled || undefined}
              onMouseEnter={() => !selected && onHover(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(item)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onSelect(item)
              }}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150',
                selected ? 'cursor-default opacity-40' : 'cursor-pointer',
                active && !selected && 'bg-accent-soft',
              )}
            >
              {renderOption(item, selected)}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function SearchCombobox<T extends { id: string }>({
  queryKey,
  search,
  selectedIds,
  onSelect,
  renderOption,
  inputId,
  label,
  resultsLabel,
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
  inputId?: string
  label?: string
  resultsLabel: string
  placeholder: string
  clearLabel: string
  emptyLabel: string
  errorLabel: (error: unknown) => string
  disabled?: boolean
  className?: string
}>) {
  const t = useT()
  const generatedId = useId()
  const resolvedInputId = inputId ?? generatedId
  const listId = useId()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 600)
    return () => window.clearTimeout(timer)
  }, [query])

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

  const optionId = (index: number) => `${listId}-option-${index}`
  const showPopup = open && debounced.length >= 2
  const showOptions = showPopup && !result.isError && items.length > 0

  useEffect(() => {
    if (activeIndex < 0) return
    const option = document.getElementById(`${listId}-option-${activeIndex}`)
    if (typeof option?.scrollIntoView === 'function') {
      option.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, listId])

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

  function moveActive(delta: 1 | -1) {
    setActiveIndex((current) => {
      const position = selectable.findIndex(({ index }) => index === current)
      if (position < 0) {
        return delta > 0 ? selectable[0].index : selectable.at(-1)!.index
      }
      const next = (position + delta + selectable.length) % selectable.length
      return selectable[next].index
    })
  }

  function handleEscape(event: KeyboardEvent<HTMLInputElement>) {
    if (showPopup) {
      event.preventDefault()
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (query) {
      event.preventDefault()
      clear()
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      handleEscape(event)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      if (selectable.length > 0) moveActive(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Enter' && showOptions && activeIndex >= 0) {
      event.preventDefault()
      const item = items[activeIndex]
      if (item) select(item)
    }
  }

  const status = comboboxStatus({
    showPopup,
    isError: result.isError,
    isFetching: result.isFetching,
    error: result.error,
    itemCount: items.length,
    emptyLabel,
    errorLabel,
    t,
  })

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cream-400"
        />
        <Input
          id={resolvedInputId}
          role="combobox"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn('pl-9', query ? 'pr-9' : undefined)}
          aria-label={inputId ? undefined : (label ?? placeholder)}
          aria-autocomplete="list"
          aria-controls={showPopup ? listId : undefined}
          aria-expanded={showOptions}
          aria-activedescendant={
            showOptions && activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
        />
        {query && !result.isFetching ? (
          <button
            type="button"
            onClick={clear}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 rounded-control p-1 text-cream-400 transition-colors hover:bg-hover hover:text-cream-50',
              focusRing,
            )}
            aria-label={clearLabel}
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
        {result.isFetching ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner size="sm" />
          </span>
        ) : null}
      </div>
      <output className="sr-only">{status}</output>
      {showPopup ? (
        <SearchComboboxOptions
          isError={result.isError}
          isFetching={result.isFetching}
          items={items}
          emptyLabel={emptyLabel}
          errorLabel={errorLabel}
          error={result.error}
          listId={listId}
          resultsLabel={resultsLabel}
          showOptions={showOptions}
          optionId={optionId}
          selectedIds={selectedIds}
          activeIndex={activeIndex}
          disabled={disabled}
          onHover={setActiveIndex}
          onSelect={select}
          renderOption={renderOption}
        />
      ) : null}
    </div>
  )
}

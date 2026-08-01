import { RefreshCw, Trash2, X } from 'lucide-react'
import type { PlaylistSummary } from '@blendify/contracts'
import { LibraryItem } from '@/components/playlist/library-item'
import {
  toBulkPending,
  type ConfirmCopy,
} from '@/components/playlist/library-list-helpers'
import type { PendingLibraryConfirm } from '@/components/playlist/library-types'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState } from '@/components/ui/feedback'
import { SearchField } from '@/components/ui/search-field'
import { LoadingState } from '@/components/ui/spinner'
import { useLibraryList } from '@/hooks/use-library-list'
import { useT } from '@/i18n/use-t'

function LibraryToolbar({
  search,
  onSearchChange,
  showSelectionToggle,
  selecting,
  onToggleSelecting,
  refreshing,
  busy,
  onRefresh,
}: Readonly<{
  search: string
  onSearchChange: (value: string) => void
  showSelectionToggle: boolean
  selecting: boolean
  onToggleSelecting: () => void
  refreshing: boolean
  busy: boolean
  onRefresh: () => void
}>) {
  const t = useT()
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
      <SearchField
        value={search}
        onChange={onSearchChange}
        placeholder={t('library.searchPlaceholder')}
        clearLabel={t('library.clearSearch')}
        className="flex-1 sm:max-w-sm"
      />
      <div className="flex gap-2">
        {showSelectionToggle ? (
          <Button size="sm" variant="ghost" onClick={onToggleSelecting}>
            {selecting ? (
              <X className="size-3.5" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            {selecting
              ? t('library.doneSelecting')
              : t('library.editSelection')}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          loading={refreshing}
          disabled={busy || selecting}
          onClick={onRefresh}
        >
          {!refreshing ? <RefreshCw className="size-3.5" /> : null}
          {t('library.refresh')}
        </Button>
      </div>
    </div>
  )
}

function LibrarySelectionBar({
  selectedPlaylists,
  selectedActive,
  allVisibleSelected,
  onToggleAllVisible,
  onAskConfirm,
}: Readonly<{
  selectedPlaylists: PlaylistSummary[]
  selectedActive: PlaylistSummary[]
  allVisibleSelected: boolean
  onToggleAllVisible: (selectAll: boolean) => void
  onAskConfirm: (confirm: PendingLibraryConfirm) => void
}>) {
  const t = useT()
  const hasSelection = selectedPlaylists.length > 0

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="space-y-2">
        {hasSelection ? (
          <p className="text-sm font-medium text-cream-100">
            {t('library.selectedCount', {
              count: selectedPlaylists.length,
            })}
          </p>
        ) : (
          <p className="text-sm text-cream-300">{t('library.selectHint')}</p>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-cream-200">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={() => onToggleAllVisible(!allVisibleSelected)}
            className="accent-amber-500"
          />
          {allVisibleSelected
            ? t('library.deselectAll')
            : t('library.selectAllVisible')}
        </label>
      </div>
      {hasSelection ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onAskConfirm(
                toBulkPending({
                  action: 'clear_library',
                  playlists: selectedPlaylists,
                }),
              )
            }
          >
            <Trash2 className="size-3.5" />
            {t('library.bulkRemoveSelected', {
              count: selectedPlaylists.length,
            })}
          </Button>
          {selectedActive.length ? (
            <Button
              size="sm"
              variant="danger"
              onClick={() =>
                onAskConfirm(
                  toBulkPending({
                    action: 'purge_active',
                    playlists: selectedActive,
                  }),
                )
              }
            >
              <Trash2 className="size-3.5" />
              {t('library.bulkPurgeSelected', {
                count: selectedActive.length,
              })}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function LibraryConfirmDialog({
  pending,
  confirmCopy,
  busy,
  onCancel,
  onConfirm,
}: Readonly<{
  pending: PendingLibraryConfirm | null
  confirmCopy: ConfirmCopy
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}>) {
  const t = useT()
  const isAlert = pending?.kind === 'alert'
  return (
    <ConfirmDialog
      open
      title={confirmCopy.title}
      description={confirmCopy.description}
      confirmLabel={
        isAlert ? t('library.dismiss') : t('library.confirmAction')
      }
      cancelLabel={isAlert ? undefined : t('common.cancel')}
      workingLabel={t('library.working')}
      danger={confirmCopy.danger}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

function LibraryPlaylistList({
  playlists,
  total,
  selecting,
  selectedIds,
  onToggleSelect,
  onAskConfirm,
  hasNextPage,
  fetchingNextPage,
  onLoadMore,
}: Readonly<{
  playlists: PlaylistSummary[]
  total: number
  selecting: boolean
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onAskConfirm: (confirm: PendingLibraryConfirm) => void
  hasNextPage: boolean
  fetchingNextPage: boolean
  onLoadMore: () => void
}>) {
  const t = useT()
  return (
    <>
      <p className="text-xs text-cream-500">
        {t('library.showingCount', { shown: playlists.length, total })}
      </p>
      <ul className="space-y-3">
        {playlists.map((playlist) => (
          <LibraryItem
            key={playlist.id}
            playlist={playlist}
            selecting={selecting}
            selected={selectedIds.has(playlist.id)}
            onToggleSelect={onToggleSelect}
            onAskConfirm={onAskConfirm}
          />
        ))}
      </ul>
      {hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            loading={fetchingNextPage}
            onClick={onLoadMore}
          >
            {t('library.loadMore')}
          </Button>
        </div>
      ) : null}
    </>
  )
}

export function LibraryList() {
  const list = useLibraryList()
  const t = list.t

  if (list.libraryQuery.isLoading) {
    return <LoadingState label={t('library.loading')} />
  }
  if (list.libraryQuery.isError) {
    return (
      <ErrorState
        message={t('library.loadError')}
        retryLabel={t('common.retry')}
        onRetry={() => void list.libraryQuery.refetch()}
      />
    )
  }

  const emptyTitle = list.debouncedSearch
    ? 'library.searchEmptyTitle'
    : 'library.emptyTitle'
  const emptyBody = list.debouncedSearch
    ? 'library.searchEmptyBody'
    : 'library.emptyBody'

  return (
    <div className="space-y-6">
      {!list.isLibraryEmpty ? (
        <LibraryToolbar
          search={list.search}
          onSearchChange={list.setSearch}
          showSelectionToggle={list.playlists.length > 0}
          selecting={list.selecting}
          onToggleSelecting={list.toggleSelecting}
          refreshing={list.refreshing}
          busy={list.busy}
          onRefresh={() => void list.refreshLibrary()}
        />
      ) : null}

      {list.refreshError ? (
        <ErrorState
          message={list.refreshError}
          retryLabel={t('common.retry')}
          onRetry={() => void list.refreshLibrary()}
        />
      ) : null}

      {list.selecting && list.playlists.length ? (
        <LibrarySelectionBar
          selectedPlaylists={list.selectedPlaylists}
          selectedActive={list.selectedActive}
          allVisibleSelected={list.allVisibleSelected}
          onToggleAllVisible={list.setAllVisibleSelected}
          onAskConfirm={list.setPending}
        />
      ) : null}

      {list.playlists.length === 0 ? (
        <EmptyState
          title={t(emptyTitle)}
          body={t(emptyBody)}
          action={
            list.debouncedSearch
              ? undefined
              : { to: '/app/mix', label: t('library.emptyCta') }
          }
        />
      ) : (
        <LibraryPlaylistList
          playlists={list.playlists}
          total={list.total}
          selecting={list.selecting}
          selectedIds={list.selectedIds}
          onToggleSelect={list.toggleSelection}
          onAskConfirm={list.setPending}
          hasNextPage={Boolean(list.libraryQuery.hasNextPage)}
          fetchingNextPage={list.libraryQuery.isFetchingNextPage}
          onLoadMore={() => void list.libraryQuery.fetchNextPage()}
        />
      )}
      {list.confirmCopy ? (
        <LibraryConfirmDialog
          pending={list.pending}
          confirmCopy={list.confirmCopy}
          busy={list.busy}
          onCancel={() => !list.busy && list.setPending(null)}
          onConfirm={list.confirmPending}
        />
      ) : null}
    </div>
  )
}

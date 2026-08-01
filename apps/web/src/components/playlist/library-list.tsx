import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Trash2, X } from 'lucide-react'
import type { BulkLibraryAction } from '@blendify/contracts'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import { LibraryItem } from '@/components/playlist/library-item'
import type { PendingLibraryConfirm } from '@/components/playlist/library-types'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState } from '@/components/ui/feedback'
import { SearchField } from '@/components/ui/search-field'
import { LoadingState } from '@/components/ui/spinner'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useT } from '@/i18n/use-t'

const PAGE_SIZE = 5

export function LibraryList() {
  const t = useT()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim(), 300)
  const [pending, setPending] = useState<PendingLibraryConfirm | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const libraryQuery = useInfiniteQuery({
    queryKey: ['playlists', 'library', debouncedSearch],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.listPlaylists({
        sync: false,
        limit: PAGE_SIZE,
        offset: pageParam,
        q: debouncedSearch || undefined,
      }),
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.playlists.length
      return next < lastPage.total ? next : undefined
    },
  })
  const playlists = useMemo(
    () => libraryQuery.data?.pages.flatMap((page) => page.playlists) ?? [],
    [libraryQuery.data],
  )
  const total = libraryQuery.data?.pages[0]?.total ?? 0
  const isLibraryEmpty = !debouncedSearch && total === 0
  const selectedPlaylists = playlists.filter((playlist) =>
    selectedIds.has(playlist.id),
  )
  const selectedActive = selectedPlaylists.filter(
    (playlist) => !playlist.missingOnSpotify,
  )
  const allVisibleSelected =
    playlists.length > 0 &&
    playlists.every((playlist) => selectedIds.has(playlist.id))

  useEffect(() => setSelectedIds(new Set()), [debouncedSearch])

  const remove = useMutation({
    mutationFn: ({
      id,
      fromSpotify,
    }: {
      id: string
      fromSpotify: boolean
    }) => api.deletePlaylist(id, { fromSpotify }),
    onSuccess: () => {
      setPending(null)
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
    onError: () =>
      setPending({
        kind: 'alert',
        title: t('library.actionFailedTitle'),
        description: t('library.purgeSpotifyError'),
      }),
  })
  const bulk = useMutation({
    mutationFn: ({
      action,
      playlistIds,
    }: {
      action: BulkLibraryAction
      playlistIds: string[]
    }) => api.bulkPlaylists(action, { playlistIds }),
    onSuccess: (result) => {
      setPending(null)
      setSelectedIds(new Set())
      setSelecting(false)
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
      if (result.failed > 0) {
        setPending({
          kind: 'alert',
          title: t('library.actionPartialTitle'),
          description: t('library.bulkPartial', result),
        })
      }
    },
    onError: () =>
      setPending({
        kind: 'alert',
        title: t('library.actionFailedTitle'),
        description: t('library.bulkError'),
      }),
  })
  const busy = remove.isPending || bulk.isPending
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  async function refreshLibrary() {
    if (refreshing) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      const pageCount = libraryQuery.data?.pages.length ?? 1
      for (let page = 0; page < pageCount; page += 1) {
        await api.listPlaylists({
          sync: true,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          q: debouncedSearch || undefined,
        })
      }
      await libraryQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: ['playlists', 'detail'] })
    } catch (error) {
      // Keep any partial sync that already landed in the DB.
      await libraryQuery.refetch()
      setRefreshError(getApiErrorMessage(error, t, 'library.refreshError'))
    } finally {
      setRefreshing(false)
    }
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function confirmPending() {
    if (!pending) return
    if (pending.kind === 'alert') return setPending(null)
    if (pending.kind === 'bulk') {
      return bulk.mutate({
        action: pending.action,
        playlistIds: pending.playlistIds,
      })
    }
    remove.mutate({
      id: pending.playlist.id,
      fromSpotify: pending.kind === 'purge',
    })
  }

  const confirmCopy = useMemo(() => {
    if (!pending) return null
    if (pending.kind === 'alert') {
      return {
        title: pending.title,
        description: pending.description,
        danger: false,
      }
    }
    if (pending.kind === 'bulk') {
      const purge = pending.action === 'purge_active'
      return {
        title: t(purge ? 'library.bulkPurgeTitle' : 'library.bulkRemoveTitle'),
        description: t(
          purge
            ? 'library.bulkPurgeSelectedConfirm'
            : 'library.bulkRemoveSelectedConfirm',
          { count: pending.count },
        ),
        danger: true,
      }
    }
    const purge = pending.kind === 'purge'
    return {
      title: t(purge ? 'library.purgeTitle' : 'library.deleteTitle'),
      description: t(
        purge
          ? 'library.purgeSpotifyConfirm'
          : pending.playlist.missingOnSpotify
            ? 'library.deleteConfirmDeleted'
            : 'library.deleteConfirmActive',
        { name: pending.playlist.name },
      ),
      danger: true,
    }
  }, [pending, t])

  if (libraryQuery.isLoading) return <LoadingState label={t('library.loading')} />
  if (libraryQuery.isError) {
    return (
      <ErrorState
        message={t('library.loadError')}
        retryLabel={t('common.retry')}
        onRetry={() => void libraryQuery.refetch()}
      />
    )
  }

  return (
    <div className="space-y-6">
      {!isLibraryEmpty ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={t('library.searchPlaceholder')}
            clearLabel={t('library.clearSearch')}
            className="flex-1 sm:max-w-sm"
          />
          <div className="flex gap-2">
            {playlists.length ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelecting((value) => !value)
                  setSelectedIds(new Set())
                }}
              >
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
              onClick={() => void refreshLibrary()}
            >
              {!refreshing ? <RefreshCw className="size-3.5" /> : null}
              {t('library.refresh')}
            </Button>
          </div>
        </div>
      ) : null}

      {refreshError ? (
        <ErrorState
          message={refreshError}
          retryLabel={t('common.retry')}
          onRetry={() => void refreshLibrary()}
        />
      ) : null}

      {selecting && playlists.length ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="space-y-2">
            {selectedPlaylists.length === 0 ? (
              <p className="text-sm text-cream-300">{t('library.selectHint')}</p>
            ) : (
              <p className="text-sm font-medium text-cream-100">
                {t('library.selectedCount', {
                  count: selectedPlaylists.length,
                })}
              </p>
            )}
            <label className="inline-flex items-center gap-2 text-sm text-cream-200">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={() =>
                  setSelectedIds(
                    allVisibleSelected
                      ? new Set()
                      : new Set(playlists.map((playlist) => playlist.id)),
                  )
                }
                className="accent-amber-500"
              />
              {allVisibleSelected
                ? t('library.deselectAll')
                : t('library.selectAllVisible')}
            </label>
          </div>
          {selectedPlaylists.length ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setPending({
                    kind: 'bulk',
                    action: 'clear_library',
                    playlistIds: selectedPlaylists.map(({ id }) => id),
                    count: selectedPlaylists.length,
                  })
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
                    setPending({
                      kind: 'bulk',
                      action: 'purge_active',
                      playlistIds: selectedActive.map(({ id }) => id),
                      count: selectedActive.length,
                    })
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
      ) : null}

      {playlists.length === 0 ? (
        <EmptyState
          title={t(debouncedSearch ? 'library.searchEmptyTitle' : 'library.emptyTitle')}
          body={t(debouncedSearch ? 'library.searchEmptyBody' : 'library.emptyBody')}
          action={
            debouncedSearch
              ? undefined
              : { to: '/app/mix', label: t('library.emptyCta') }
          }
        />
      ) : (
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
                onToggleSelect={toggleSelection}
                onAskConfirm={setPending}
              />
            ))}
          </ul>
          {libraryQuery.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                loading={libraryQuery.isFetchingNextPage}
                onClick={() => void libraryQuery.fetchNextPage()}
              >
                {t('library.loadMore')}
              </Button>
            </div>
          ) : null}
        </>
      )}
      {confirmCopy ? (
        <ConfirmDialog
          open
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={
            pending?.kind === 'alert'
              ? t('library.dismiss')
              : t('library.confirmAction')
          }
          cancelLabel={
            pending?.kind === 'alert' ? undefined : t('common.cancel')
          }
          workingLabel={t('library.working')}
          danger={confirmCopy.danger}
          busy={busy}
          onCancel={() => !busy && setPending(null)}
          onConfirm={confirmPending}
        />
      ) : null}
    </div>
  )
}

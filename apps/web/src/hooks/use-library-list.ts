import { useEffect, useMemo, useState } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { BulkLibraryAction } from '@blendify/contracts'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import type { PendingLibraryConfirm } from '@/components/playlist/library-types'
import {
  buildConfirmCopy,
  toggleIdInSet,
  visibleSelectionState,
} from '@/components/playlist/library-list-helpers'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useT } from '@/i18n/use-t'

const PAGE_SIZE = 10

export function useLibraryList() {
  const t = useT()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim(), 300)
  const [pending, setPending] = useState<PendingLibraryConfirm | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

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
  const { selectedPlaylists, selectedActive, allVisibleSelected } =
    visibleSelectionState(playlists, selectedIds)

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
  const confirmCopy = useMemo(
    () => buildConfirmCopy(pending, t),
    [pending, t],
  )

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
    setSelectedIds((current) => toggleIdInSet(current, id))
  }

  function toggleSelecting() {
    setSelecting((value) => !value)
    setSelectedIds(new Set())
  }

  function setAllVisibleSelected(selectAll: boolean) {
    setSelectedIds(
      selectAll ? new Set(playlists.map((playlist) => playlist.id)) : new Set(),
    )
  }

  function confirmPending() {
    if (!pending) return
    if (pending.kind === 'alert') {
      setPending(null)
      return
    }
    if (pending.kind === 'bulk') {
      bulk.mutate({
        action: pending.action,
        playlistIds: pending.playlistIds,
      })
      return
    }
    remove.mutate({
      id: pending.playlist.id,
      fromSpotify: pending.kind === 'purge',
    })
  }

  return {
    t,
    search,
    setSearch,
    debouncedSearch,
    pending,
    setPending,
    selecting,
    selectedIds,
    refreshing,
    refreshError,
    libraryQuery,
    playlists,
    total,
    isLibraryEmpty,
    selectedPlaylists,
    selectedActive,
    allVisibleSelected,
    busy,
    confirmCopy,
    refreshLibrary,
    toggleSelection,
    toggleSelecting,
    setAllVisibleSelected,
    confirmPending,
  }
}

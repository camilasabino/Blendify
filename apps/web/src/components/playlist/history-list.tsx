import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  Check,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Music2,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import {
  api,
  type BulkHistoryAction,
  type Playlist,
  type PlaylistStatus,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState } from '@/components/ui/feedback'
import { SearchField } from '@/components/ui/search-field'
import { LoadingState, Spinner } from '@/components/ui/spinner'
import { PlaylistPreview } from '@/components/playlist/playlist-preview'
import { useLocaleStore } from '@/i18n/use-locale'
import { useT } from '@/i18n/use-t'
import { copyToClipboard, cn, formatDate, formatDuration } from '@/lib/utils'

const PAGE_SIZE = 5

function CoverThumb({
  playlist,
  deleted,
}: {
  playlist: Playlist
  deleted: boolean
}) {
  const src =
    playlist.imageUrl ||
    playlist.artists?.find((a) => a.imageUrl)?.imageUrl ||
    null

  return (
    <div
      className={cn(
        'relative size-16 shrink-0 overflow-hidden rounded-lg bg-charcoal-700 sm:size-20',
        deleted && 'opacity-70 grayscale',
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex size-full items-center justify-center">
          <Music2 className="size-6 text-cream-500" />
        </span>
      )}
    </div>
  )
}

function statusLabel(status: PlaylistStatus, t: ReturnType<typeof useT>) {
  switch (status) {
    case 'COMPLETED':
      return t('history.statusActive')
    case 'PENDING':
      return t('history.statusPending')
    case 'FAILED':
      return t('history.statusFailed')
  }
}

function statusStyles(status: PlaylistStatus) {
  switch (status) {
    case 'COMPLETED':
      return 'text-emerald-300 bg-emerald-950/50 border-emerald-800/50'
    case 'PENDING':
      return 'text-amber-300 bg-amber-950/40 border-amber-800/40'
    case 'FAILED':
      return 'text-red-300 bg-red-950/50 border-red-800/50'
  }
}

type PendingConfirm =
  | {
      kind: 'delete' | 'purge'
      playlist: Playlist
    }
  | {
      kind: 'bulk'
      action: BulkHistoryAction
      count: number
    }
  | {
      kind: 'alert'
      title: string
      description: string
    }

function HistoryItem({
  playlist,
  onAskConfirm,
}: {
  playlist: Playlist
  onAskConfirm: (confirm: PendingConfirm) => void
}) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(playlist.name)
  const [copied, setCopied] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const deleted = Boolean(playlist.missingOnSpotify)
  const menuRef = useRef<HTMLDivElement>(null)
  const canPreview = !deleted && Boolean(playlist.spotifyId)

  useEffect(() => {
    setNameDraft(playlist.name)
  }, [playlist.id, playlist.name])

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['playlists'] })
  }

  const renameMutation = useMutation({
    mutationFn: (name: string) => api.renamePlaylist(playlist.id, name),
    onSuccess: () => {
      setRenaming(false)
      void invalidate()
    },
  })

  const busy = renameMutation.isPending

  async function handleCopy() {
    if (!playlist.spotifyUrl || deleted) return
    const ok = await copyToClipboard(playlist.spotifyUrl)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }

  function submitRename() {
    const next = nameDraft.trim()
    if (!next || next === playlist.name) {
      setRenaming(false)
      setNameDraft(playlist.name)
      return
    }
    renameMutation.mutate(next)
  }

  return (
    <li
      className={cn(
        'group animate-fade-up rounded-xl border bg-charcoal-800/40 p-4 transition-colors duration-200',
        deleted
          ? 'border-red-900/30 opacity-90'
          : 'border-cream-200/10 hover:border-amber-500/25 hover:bg-charcoal-800/70',
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
          <CoverThumb playlist={playlist} deleted={deleted} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-cream-400">
                {formatDate(playlist.createdAt, locale)}
              </span>
              {deleted ? (
                <span className="rounded-md border border-red-800/50 bg-red-950/50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-red-300">
                  {t('history.deleted')}
                </span>
              ) : (
                <span
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
                    statusStyles(playlist.status),
                  )}
                >
                  {statusLabel(playlist.status, t)}
                </span>
              )}
            </div>

            {renaming ? (
              <div className="flex max-w-md flex-wrap items-center gap-2">
                <Input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename()
                    if (e.key === 'Escape') {
                      setRenaming(false)
                      setNameDraft(playlist.name)
                    }
                  }}
                  disabled={busy}
                  autoFocus
                />
                <Button
                  size="sm"
                  loading={renameMutation.isPending}
                  onClick={submitRename}
                >
                  {t('history.save')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setRenaming(false)
                    setNameDraft(playlist.name)
                  }}
                >
                  {t('history.cancel')}
                </Button>
              </div>
            ) : (
              <h3 className="truncate font-display text-lg text-cream-50">
                {playlist.name}
              </h3>
            )}

            <p className="text-sm text-cream-400">
              {t('history.meta', {
                tracks: playlist.trackCount,
                duration: formatDuration(playlist.totalDurationMs),
              })}
            </p>
            {deleted ? (
              <p className="text-xs text-cream-500">{t('history.deletedHint')}</p>
            ) : null}
          </div>
        </div>

        <div className="relative flex flex-wrap items-center gap-2" ref={menuRef}>
          {canPreview && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPreviewOpen((open) => !open)}
            >
              {previewOpen ? t('preview.hide') : t('preview.show')}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('history.more')}
            disabled={busy}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {busy ? (
              <Spinner size="sm" className="text-current" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </Button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-lg border border-cream-200/10 bg-charcoal-800 py-1 shadow-xl animate-fade-in"
            >
              {playlist.spotifyUrl && !deleted && (
                <>
                  <a
                    href={playlist.spotifyUrl}
                    target="_blank"
                    rel="noreferrer"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-cream-100 hover:bg-amber-500/10"
                    onClick={() => setMenuOpen(false)}
                  >
                    <ExternalLink className="size-3.5" />
                    {t('history.openSpotify')}
                  </a>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-cream-100 hover:bg-amber-500/10"
                    onClick={() => {
                      setMenuOpen(false)
                      void handleCopy()
                    }}
                  >
                    {copied ? (
                      <Check className="size-3.5" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {copied ? t('history.copied') : t('history.copy')}
                  </button>
                </>
              )}
              {!deleted && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-cream-100 hover:bg-amber-500/10"
                  onClick={() => {
                    setMenuOpen(false)
                    setRenaming(true)
                  }}
                >
                  <Pencil className="size-3.5" />
                  {t('history.rename')}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-cream-200 hover:bg-charcoal-700"
                onClick={() => {
                  setMenuOpen(false)
                  onAskConfirm({ kind: 'delete', playlist })
                }}
              >
                <Trash2 className="size-3.5" />
                {t('history.deleteHistory')}
              </button>
              {!deleted && playlist.spotifyId && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-300 hover:bg-red-950/40"
                  onClick={() => {
                    setMenuOpen(false)
                    onAskConfirm({ kind: 'purge', playlist })
                  }}
                >
                  <Trash2 className="size-3.5" />
                  {t('history.purgeSpotify')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {previewOpen && canPreview && (
        <div className="mt-4 border-t border-cream-200/10 pt-4">
          <PlaylistPreview
            mode="embed"
            spotifyId={playlist.spotifyId}
            spotifyUrl={playlist.spotifyUrl}
            imageUrl={playlist.imageUrl}
            tracks={playlist.tracks ?? []}
          />
        </div>
      )}
    </li>
  )
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

export function HistoryList() {
  const t = useT()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim(), 300)
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const historyQuery = useInfiniteQuery({
    queryKey: ['playlists', 'history', debouncedSearch],
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
    () => historyQuery.data?.pages.flatMap((page) => page.playlists) ?? [],
    [historyQuery.data],
  )
  const total = historyQuery.data?.pages[0]?.total ?? 0
  const activeCount = historyQuery.data?.pages[0]?.activeCount ?? 0
  const deletedCount = historyQuery.data?.pages[0]?.deletedCount ?? 0

  const deleteMutation = useMutation({
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
    onError: () => {
      setPending({
        kind: 'alert',
        title: t('history.actionFailedTitle'),
        description: t('history.purgeSpotifyError'),
      })
    },
  })

  const bulkMutation = useMutation({
    mutationFn: ({
      action,
      q,
    }: {
      action: BulkHistoryAction
      q?: string
    }) => api.bulkPlaylists(action, { q }),
    onSuccess: (result) => {
      setPending(null)
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
      if (result.failed > 0) {
        setPending({
          kind: 'alert',
          title: t('history.actionPartialTitle'),
          description: t('history.bulkPartial', {
            affected: result.affected,
            failed: result.failed,
          }),
        })
      }
    },
    onError: () => {
      setPending({
        kind: 'alert',
        title: t('history.actionFailedTitle'),
        description: t('history.bulkError'),
      })
    },
  })

  function confirmPending() {
    if (!pending) return
    if (pending.kind === 'alert') {
      setPending(null)
      return
    }
    if (pending.kind === 'bulk') {
      bulkMutation.mutate({
        action: pending.action,
        q: debouncedSearch || undefined,
      })
      return
    }
    deleteMutation.mutate({
      id: pending.playlist.id,
      fromSpotify: pending.kind === 'purge',
    })
  }

  const confirmBusy =
    deleteMutation.isPending || bulkMutation.isPending

  const confirmCopy = useMemo(() => {
    if (!pending) return null
    if (pending.kind === 'alert') {
      return {
        title: pending.title,
        description: pending.description,
        confirmLabel: t('history.dismiss'),
        cancelLabel: undefined,
        danger: false,
      }
    }
    if (pending.kind === 'bulk') {
      const filtered = Boolean(debouncedSearch)
      return {
        title:
          pending.action === 'purge_active'
            ? t('history.bulkPurgeTitle')
            : t('history.bulkClearTitle'),
        description: t(
          pending.action === 'purge_active'
            ? filtered
              ? 'history.bulkPurgeConfirmFiltered'
              : 'history.bulkPurgeConfirm'
            : filtered
              ? 'history.bulkClearDeletedConfirmFiltered'
              : 'history.bulkClearDeletedConfirm',
          { count: pending.count, query: debouncedSearch },
        ),
        confirmLabel: t('history.confirmAction'),
        cancelLabel: t('history.cancel'),
        danger: true,
      }
    }
    if (pending.kind === 'purge') {
      return {
        title: t('history.purgeTitle'),
        description: t('history.purgeSpotifyConfirm', {
          name: pending.playlist.name,
        }),
        confirmLabel: t('history.confirmAction'),
        cancelLabel: t('history.cancel'),
        danger: true,
      }
    }
    return {
      title: t('history.deleteTitle'),
      description: t('history.deleteConfirm', {
        name: pending.playlist.name,
      }),
      confirmLabel: t('history.confirmAction'),
      cancelLabel: t('history.cancel'),
      danger: false,
    }
  }, [pending, t, debouncedSearch])

  if (historyQuery.isLoading) {
    return <LoadingState label={t('history.loading')} />
  }

  if (historyQuery.isError) {
    return (
      <ErrorState
        message={t('history.loadError')}
        retryLabel={t('history.retry')}
        onRetry={() => void historyQuery.refetch()}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t('history.searchPlaceholder')}
          clearLabel={t('history.clearSearch')}
          className="flex-1 sm:max-w-sm"
        />

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            loading={historyQuery.isFetching}
            onClick={() => {
              void queryClient
                .fetchInfiniteQuery({
                  queryKey: ['playlists', 'history', debouncedSearch, 'sync'],
                  initialPageParam: 0,
                  queryFn: ({ pageParam }) =>
                    api.listPlaylists({
                      sync: true,
                      limit: PAGE_SIZE,
                      offset: pageParam as number,
                      q: debouncedSearch || undefined,
                    }),
                })
                .then(() =>
                  queryClient.invalidateQueries({
                    queryKey: ['playlists', 'history'],
                  }),
                )
            }}
            disabled={historyQuery.isFetching || confirmBusy}
          >
            {!historyQuery.isFetching ? (
              <RefreshCw className="size-3.5" />
            ) : null}
            {t('history.refresh')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={
              bulkMutation.isPending &&
              bulkMutation.variables?.action === 'clear_deleted'
            }
            disabled={deletedCount === 0 || confirmBusy}
            onClick={() =>
              setPending({
                kind: 'bulk',
                action: 'clear_deleted',
                count: deletedCount,
              })
            }
          >
            {!(
              bulkMutation.isPending &&
              bulkMutation.variables?.action === 'clear_deleted'
            ) ? (
              <Trash2 className="size-3.5" />
            ) : null}
            {t('history.bulkClearDeleted', { count: deletedCount })}
          </Button>
          <Button
            size="sm"
            variant="danger"
            loading={
              bulkMutation.isPending &&
              bulkMutation.variables?.action === 'purge_active'
            }
            disabled={activeCount === 0 || confirmBusy}
            onClick={() =>
              setPending({
                kind: 'bulk',
                action: 'purge_active',
                count: activeCount,
              })
            }
          >
            {!(
              bulkMutation.isPending &&
              bulkMutation.variables?.action === 'purge_active'
            ) ? (
              <Trash2 className="size-3.5" />
            ) : null}
            {t('history.bulkPurge', { count: activeCount })}
          </Button>
        </div>
      </div>

      {playlists.length === 0 ? (
        <EmptyState
          title={
            debouncedSearch
              ? t('history.searchEmptyTitle')
              : t('history.emptyTitle')
          }
          body={
            debouncedSearch
              ? t('history.searchEmptyBody')
              : t('history.emptyBody')
          }
          action={
            !debouncedSearch
              ? { to: '/app', label: t('history.emptyCta') }
              : undefined
          }
          className="rounded-xl"
        />
      ) : (
        <>
          <p className="text-xs text-cream-500">
            {t('history.showingCount', {
              shown: playlists.length,
              total,
            })}
          </p>
          <ul className="space-y-3">
            {playlists.map((playlist) => (
              <HistoryItem
                key={playlist.id}
                playlist={playlist}
                onAskConfirm={setPending}
              />
            ))}
          </ul>
          {historyQuery.hasNextPage ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="secondary"
                loading={historyQuery.isFetchingNextPage}
                onClick={() => void historyQuery.fetchNextPage()}
              >
                {t('history.loadMore')}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {confirmCopy && (
        <ConfirmDialog
          open={Boolean(pending)}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          cancelLabel={confirmCopy.cancelLabel}
          danger={confirmCopy.danger}
          busy={confirmBusy && pending?.kind !== 'alert'}
          onCancel={() => {
            if (confirmBusy && pending?.kind !== 'alert') return
            setPending(null)
          }}
          onConfirm={confirmPending}
        />
      )}
    </div>
  )
}

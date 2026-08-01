import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, ExternalLink, MoreHorizontal, Music2, Pencil, Trash2 } from 'lucide-react'
import type { PlaylistStatus, PlaylistSummary } from '@blendify/contracts'
import { api } from '@/lib/api'
import type { PendingLibraryConfirm } from '@/components/playlist/library-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useLocaleStore } from '@/i18n/use-locale'
import { useT } from '@/i18n/use-t'
import { cn, copyToClipboard, formatDate, formatDuration, focusRing } from '@/lib/utils'

const PlaylistDetail = lazy(
  () => import('@/components/playlist/playlist-detail'),
)

function statusStyles(status: PlaylistStatus) {
  if (status === 'COMPLETED') {
    return 'text-emerald-300 bg-emerald-950/50 border-emerald-800/50'
  }
  if (status === 'PENDING') {
    return 'text-amber-300 bg-amber-950/40 border-amber-800/40'
  }
  return 'text-red-300 bg-red-950/50 border-red-800/50'
}

function statusLabelFor(
  status: PlaylistStatus,
  t: ReturnType<typeof useT>,
): string {
  if (status === 'COMPLETED') return t('library.statusActive')
  if (status === 'PENDING') return t('library.statusPending')
  return t('library.statusFailed')
}

function itemBorderClass(selecting: boolean, selected: boolean, deleted: boolean) {
  if (selecting && selected) {
    return 'border-amber-500/55 bg-amber-500/[0.12] ring-1 ring-amber-500/25'
  }
  if (selecting) return 'border-cream-200/15 hover:border-amber-500/35'
  if (deleted) return 'border-red-900/35 opacity-90'
  return 'border-cream-200/12 hover:border-amber-500/30'
}

function LibraryStatusBadge({
  deleted,
  status,
}: Readonly<{
  deleted: boolean
  status: PlaylistStatus
}>) {
  const t = useT()
  const label = deleted
    ? t('library.deleted')
    : statusLabelFor(status, t)

  return (
    <span
      className={cn(
        'rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase',
        deleted
          ? 'border-red-800/50 bg-red-950/50 text-red-300'
          : statusStyles(status),
      )}
    >
      {label}
    </span>
  )
}

function LibraryItemCover({
  imageUrl,
  deleted,
}: Readonly<{
  imageUrl: string | null
  deleted: boolean
}>) {
  return (
    <div
      className={cn(
        'flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-charcoal-700',
        deleted && 'grayscale',
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <Music2 className="size-6 text-cream-500" />
      )}
    </div>
  )
}

function LibraryItemRenameField({
  nameDraft,
  onDraftChange,
  onSubmit,
  onCancel,
  saving,
}: Readonly<{
  nameDraft: string
  onDraftChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
  saving: boolean
}>) {
  const t = useT()
  return (
    <div className="flex max-w-md flex-wrap gap-2">
      <Input
        value={nameDraft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit()
          if (event.key === 'Escape') onCancel()
        }}
        autoFocus
      />
      <Button size="sm" loading={saving} onClick={onSubmit}>
        {t('library.save')}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  )
}

function LibraryItemMeta({
  playlist,
  deleted,
  renaming,
  selecting,
  nameDraft,
  onDraftChange,
  onSubmitRename,
  onCancelRename,
  renamePending,
}: Readonly<{
  playlist: PlaylistSummary
  deleted: boolean
  renaming: boolean
  selecting: boolean
  nameDraft: string
  onDraftChange: (value: string) => void
  onSubmitRename: () => void
  onCancelRename: () => void
  renamePending: boolean
}>) {
  const t = useT()
  const locale = useLocaleStore((state) => state.locale)
  const showRename = renaming && !selecting

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-cream-400">
          {formatDate(playlist.createdAt, locale)}
        </span>
        <LibraryStatusBadge deleted={deleted} status={playlist.status} />
      </div>
      {showRename ? (
        <LibraryItemRenameField
          nameDraft={nameDraft}
          onDraftChange={onDraftChange}
          onSubmit={onSubmitRename}
          onCancel={onCancelRename}
          saving={renamePending}
        />
      ) : (
        <h3 className="truncate font-display text-lg text-cream-50">
          {playlist.name}
        </h3>
      )}
      <p className="text-sm text-cream-400">
        {t('library.meta', {
          tracks: playlist.trackCount,
          duration: formatDuration(playlist.totalDurationMs),
        })}
      </p>
    </>
  )
}

function LibraryItemMenu({
  playlist,
  deleted,
  copied,
  onCopyLink,
  onStartRename,
  onAskConfirm,
}: Readonly<{
  playlist: PlaylistSummary
  deleted: boolean
  copied: boolean
  onCopyLink: () => void
  onStartRename: () => void
  onAskConfirm: (confirm: PendingLibraryConfirm) => void
}>) {
  const t = useT()
  const showSpotifyActions = Boolean(playlist.spotifyUrl) && !deleted
  const showPurge = !deleted && Boolean(playlist.spotifyId)

  return (
    <div
      role="menu"
      className="absolute right-0 top-full z-10 mt-1 w-56 rounded-lg border border-cream-200/10 bg-charcoal-800 py-1 shadow-xl"
    >
      {showSpotifyActions ? (
        <>
          <a
            href={playlist.spotifyUrl!}
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-sm text-cream-100"
          >
            <ExternalLink className="size-3.5" />
            {t('library.openSpotify')}
          </a>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-cream-100"
            onClick={onCopyLink}
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied ? t('library.copied') : t('library.copy')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-cream-100"
            onClick={onStartRename}
          >
            <Pencil className="size-3.5" />
            {t('library.rename')}
          </button>
        </>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-cream-200"
        onClick={() => onAskConfirm({ kind: 'delete', playlist })}
      >
        <Trash2 className="size-3.5" />
        {t('library.removeFromLibrary')}
      </button>
      {showPurge ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-300"
          onClick={() => onAskConfirm({ kind: 'purge', playlist })}
        >
          <Trash2 className="size-3.5" />
          {t('library.purgeSpotify')}
        </button>
      ) : null}
    </div>
  )
}

function LibraryItemActions({
  canPreview,
  previewOpen,
  onTogglePreview,
  menuOpen,
  onToggleMenu,
  menuRef,
  menu,
}: Readonly<{
  canPreview: boolean
  previewOpen: boolean
  onTogglePreview: () => void
  menuOpen: boolean
  onToggleMenu: () => void
  menuRef: RefObject<HTMLDivElement | null>
  menu: ReactNode
}>) {
  const t = useT()
  return (
    <div ref={menuRef} className="relative flex items-center gap-2">
      {canPreview ? (
        <Button size="sm" variant="secondary" onClick={onTogglePreview}>
          {previewOpen ? t('preview.hide') : t('preview.show')}
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        aria-label={t('library.more')}
        onClick={onToggleMenu}
      >
        <MoreHorizontal className="size-4" />
      </Button>
      {menuOpen ? menu : null}
    </div>
  )
}

function LibraryItemPreviewPanel({
  loading,
  detail,
}: Readonly<{
  loading: boolean
  detail: Awaited<ReturnType<typeof api.getPlaylist>> | undefined
}>) {
  if (loading) {
    return (
      <div className="mt-4 border-t border-cream-200/10 pt-4">
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      </div>
    )
  }
  if (!detail) return null
  return (
    <div className="mt-4 border-t border-cream-200/10 pt-4">
      <Suspense
        fallback={
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        }
      >
        <PlaylistDetail playlist={detail} />
      </Suspense>
    </div>
  )
}

function resolveCoverImage(playlist: PlaylistSummary): string | null {
  const seedImageUrl = playlist.seeds
    .flatMap((seed) =>
      seed.type === 'track' || !seed.imageUrl ? [] : [seed.imageUrl],
    )
    .at(0)
  return playlist.imageUrl ?? seedImageUrl ?? null
}

export function LibraryItem({
  playlist,
  selecting,
  selected,
  onToggleSelect,
  onAskConfirm,
}: Readonly<{
  playlist: PlaylistSummary
  selecting: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  onAskConfirm: (confirm: PendingLibraryConfirm) => void
}>) {
  const t = useT()
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(playlist.name)
  const [copied, setCopied] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const deleted = playlist.missingOnSpotify
  const canPreview = !deleted && Boolean(playlist.spotifyId)

  useEffect(() => setNameDraft(playlist.name), [playlist.name])

  useEffect(() => {
    if (!selecting) return
    setMenuOpen(false)
    setPreviewOpen(false)
    setRenaming(false)
  }, [selecting])

  useEffect(() => {
    if (!menuOpen) return
    function close(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', closeWithEscape)
    }
  }, [menuOpen])

  const detailQuery = useQuery({
    queryKey: ['playlists', 'detail', playlist.id],
    queryFn: () => api.getPlaylist(playlist.id),
    enabled: previewOpen && canPreview && !selecting,
  })
  const rename = useMutation({
    mutationFn: (name: string) => api.renamePlaylist(playlist.id, name),
    onSuccess: () => {
      setRenaming(false)
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })

  function submitRename() {
    const next = nameDraft.trim()
    if (!next || next === playlist.name) {
      setRenaming(false)
      setNameDraft(playlist.name)
      return
    }
    rename.mutate(next)
  }

  async function copyLink() {
    if (!playlist.spotifyUrl || deleted) return
    if (await copyToClipboard(playlist.spotifyUrl)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_600)
    }
  }

  const imageUrl = resolveCoverImage(playlist)
  const cover = <LibraryItemCover imageUrl={imageUrl} deleted={deleted} />
  const meta = (
    <LibraryItemMeta
      playlist={playlist}
      deleted={deleted}
      renaming={renaming}
      selecting={selecting}
      nameDraft={nameDraft}
      onDraftChange={setNameDraft}
      onSubmitRename={submitRename}
      onCancelRename={() => setRenaming(false)}
      renamePending={rename.isPending}
    />
  )

  return (
    <li
      className={cn(
        'group animate-fade-up rounded-xl border bg-gradient-to-br from-charcoal-800/75 to-charcoal-900/50 p-4 transition-all',
        itemBorderClass(selecting, selected, deleted),
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
        {selecting ? (
          <button
            type="button"
            onClick={() => onToggleSelect(playlist.id)}
            className={cn(
              'flex min-w-0 flex-1 gap-3 rounded-lg text-left',
              focusRing,
            )}
            aria-pressed={selected}
            aria-label={t('library.selectItem', { name: playlist.name })}
          >
            <input
              type="checkbox"
              checked={selected}
              readOnly
              tabIndex={-1}
              className="pointer-events-none mt-1 size-4 shrink-0 accent-amber-500"
              aria-hidden
            />
            {cover}
            <div className="min-w-0 flex-1 space-y-2">{meta}</div>
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 gap-3">
            {cover}
            <div className="min-w-0 flex-1 space-y-2">{meta}</div>
          </div>
        )}

        {!selecting ? (
          <LibraryItemActions
            canPreview={canPreview}
            previewOpen={previewOpen}
            onTogglePreview={() => setPreviewOpen((open) => !open)}
            menuOpen={menuOpen}
            onToggleMenu={() => setMenuOpen((open) => !open)}
            menuRef={menuRef}
            menu={
              <LibraryItemMenu
                playlist={playlist}
                deleted={deleted}
                copied={copied}
                onCopyLink={() => void copyLink()}
                onStartRename={() => {
                  setMenuOpen(false)
                  setRenaming(true)
                }}
                onAskConfirm={onAskConfirm}
              />
            }
          />
        ) : null}
      </div>
      {!selecting && previewOpen && canPreview ? (
        <LibraryItemPreviewPanel
          loading={detailQuery.isLoading}
          detail={detailQuery.data}
        />
      ) : null}
    </li>
  )
}

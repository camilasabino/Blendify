import {
  lazy,
  Suspense,
  useEffect,
  useId,
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
    return 'border-success-line bg-success-soft text-success'
  }
  if (status === 'PENDING') {
    return 'border-warning-line bg-warning-soft text-warning'
  }
  return 'border-danger-line bg-danger-soft text-danger'
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
    return 'border-accent-line bg-accent-soft'
  }
  if (selecting) return 'border-control hover:border-control-hover hover:bg-hover'
  if (deleted) return 'border-danger-line/60'
  return 'border-divider hover:border-control'
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
        'rounded-control border px-2 py-0.5 text-xs font-medium',
        deleted
          ? 'border-danger-line bg-danger-soft text-danger'
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
        'flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-control bg-charcoal-700',
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
        <Music2 aria-hidden className="size-6 text-cream-500" />
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
        <h3 className="truncate font-sans text-base font-semibold text-cream-50">
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

const menuItemClass =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus'

function LibraryItemMenu({
  id,
  playlist,
  deleted,
  copied,
  onCopyLink,
  onStartRename,
  onAskConfirm,
}: Readonly<{
  id: string
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
    <ul
      id={id}
      aria-label={t('library.more')}
      className="absolute right-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-card border border-divider bg-raised py-1 shadow-xl shadow-charcoal-950/60"
    >
      {showSpotifyActions ? (
        <>
          <li>
            <a
              href={playlist.spotifyUrl!}
              target="_blank"
              rel="noreferrer"
              className={cn(menuItemClass, 'text-cream-100')}
            >
              <ExternalLink aria-hidden className="size-3.5" />
              {t('library.openSpotify')}
            </a>
          </li>
          <li>
            <button
              type="button"
              className={cn(menuItemClass, 'text-cream-100')}
              onClick={onCopyLink}
            >
              {copied ? (
                <Check aria-hidden className="size-3.5" />
              ) : (
                <Copy aria-hidden className="size-3.5" />
              )}
              {copied ? t('library.copied') : t('library.copy')}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={cn(menuItemClass, 'text-cream-100')}
              onClick={onStartRename}
            >
              <Pencil aria-hidden className="size-3.5" />
              {t('library.rename')}
            </button>
          </li>
        </>
      ) : null}
      <li>
        <button
          type="button"
          className={cn(menuItemClass, 'text-cream-200')}
          onClick={() => onAskConfirm({ kind: 'delete', playlist })}
        >
          <Trash2 aria-hidden className="size-3.5" />
          {t('library.removeFromLibrary')}
        </button>
      </li>
      {showPurge ? (
        <li>
          <button
            type="button"
            className={cn(menuItemClass, 'text-danger')}
            onClick={() => onAskConfirm({ kind: 'purge', playlist })}
          >
            <Trash2 aria-hidden className="size-3.5" />
            {t('library.purgeSpotify')}
          </button>
        </li>
      ) : null}
    </ul>
  )
}

function LibraryItemActions({
  canPreview,
  previewOpen,
  onTogglePreview,
  menuOpen,
  menuId,
  onToggleMenu,
  menuRef,
  menuTriggerRef,
  menu,
}: Readonly<{
  canPreview: boolean
  previewOpen: boolean
  onTogglePreview: () => void
  menuOpen: boolean
  menuId: string
  onToggleMenu: () => void
  menuRef: RefObject<HTMLDivElement | null>
  menuTriggerRef: RefObject<HTMLButtonElement | null>
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
        ref={menuTriggerRef}
        size="sm"
        variant="ghost"
        aria-label={t('library.more')}
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={onToggleMenu}
        className={cn(menuOpen && 'bg-hover text-cream-50')}
      >
        <MoreHorizontal aria-hidden className="size-4" />
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
      <div className="mt-4 border-t border-divider pt-4">
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      </div>
    )
  }
  if (!detail) return null
  return (
    <div className="mt-4 border-t border-divider pt-4">
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
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
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
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      menuTriggerRef.current?.focus()
    }
    function closeOnFocusOut(event: FocusEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', closeWithEscape)
    document.addEventListener('focusin', closeOnFocusOut)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', closeWithEscape)
      document.removeEventListener('focusin', closeOnFocusOut)
    }
  }, [menuOpen])

  function closeMenu() {
    setMenuOpen(false)
    menuTriggerRef.current?.focus()
  }

  const detailQuery = useQuery({
    queryKey: ['playlists', 'detail', playlist.id],
    queryFn: () => api.getPlaylist(playlist.id),
    enabled: previewOpen && canPreview && !selecting,
  })
  const rename = useMutation({
    mutationFn: (name: string) => api.renamePlaylist(playlist.id, name),
    onSuccess: () => {
      finishRename()
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })

  function finishRename() {
    setRenaming(false)
    menuTriggerRef.current?.focus()
  }

  function submitRename() {
    const next = nameDraft.trim()
    if (!next || next === playlist.name) {
      finishRename()
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
      onCancelRename={finishRename}
      renamePending={rename.isPending}
    />
  )

  return (
    <li
      className={cn(
        'animate-fade-up rounded-card border bg-card p-4 transition-colors',
        itemBorderClass(selecting, selected, deleted),
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
        {selecting ? (
          <button
            type="button"
            onClick={() => onToggleSelect(playlist.id)}
            className={cn(
              'flex min-w-0 flex-1 gap-3 rounded-control text-left',
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
            menuId={menuId}
            onToggleMenu={() => setMenuOpen((open) => !open)}
            menuRef={menuRef}
            menuTriggerRef={menuTriggerRef}
            menu={
              <LibraryItemMenu
                id={menuId}
                playlist={playlist}
                deleted={deleted}
                copied={copied}
                onCopyLink={() => void copyLink()}
                onStartRename={() => {
                  setMenuOpen(false)
                  setRenaming(true)
                }}
                onAskConfirm={(confirm) => {
                  closeMenu()
                  onAskConfirm(confirm)
                }}
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

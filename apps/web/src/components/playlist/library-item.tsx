import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Music2,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { PlaylistStatus, PlaylistSummary } from '@blendify/contracts'
import { api } from '@/lib/api'
import type { PendingLibraryConfirm } from '@/components/playlist/library-types'
import {
  libraryDisplayTitle,
  libraryKindKey,
} from '@/components/playlist/library-list-helpers'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { popoverSurfaceClass, usePopover } from '@/hooks/use-popover'
import { useLocaleStore } from '@/i18n/use-locale'
import { useT } from '@/i18n/use-t'
import { formatSongCount } from '@/lib/song-count'
import {
  cn,
  copyToClipboard,
  focusRing,
  formatListeningTime,
  formatShortDate,
} from '@/lib/utils'

const PlaylistDetail = lazy(
  () => import('@/components/playlist/playlist-detail'),
)

const badgeBase =
  'inline-flex shrink-0 items-center rounded-control border px-1.5 py-0.5 text-[0.6875rem] font-medium leading-none'

function exceptionalStatus(
  status: PlaylistStatus,
  deleted: boolean,
  t: ReturnType<typeof useT>,
): { label: string; className: string } | null {
  if (deleted) {
    return {
      label: t('library.deleted'),
      className: 'border-control text-cream-300',
    }
  }
  if (status === 'PENDING') {
    return {
      label: t('library.statusPending'),
      className: 'border-warning-line bg-warning-soft text-warning',
    }
  }
  if (status === 'FAILED') {
    return {
      label: t('library.statusFailed'),
      className: 'border-danger-line bg-danger-soft text-danger',
    }
  }
  return null
}

function itemBorderClass(selecting: boolean, selected: boolean) {
  if (selecting && selected) {
    return 'border-accent-line bg-accent-soft'
  }
  if (selecting) return 'border-control hover:border-control-hover hover:bg-hover'
  return 'border-divider'
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
        'flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-control bg-charcoal-700',
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
  title,
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
  title: string
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
  const status = exceptionalStatus(playlist.status, deleted, t)
  const details = [
    formatShortDate(playlist.createdAt, locale),
    formatSongCount(playlist.trackCount, t),
    playlist.totalDurationMs > 0
      ? formatListeningTime(playlist.totalDurationMs)
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      {showRename ? (
        <LibraryItemRenameField
          nameDraft={nameDraft}
          onDraftChange={onDraftChange}
          onSubmit={onSubmitRename}
          onCancel={onCancelRename}
          saving={renamePending}
        />
      ) : (
        <h3
          className={cn(
            'truncate font-sans text-base font-semibold',
            deleted ? 'text-cream-300' : 'text-cream-50',
          )}
          title={playlist.name}
        >
          {title}
        </h3>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn(badgeBase, 'border-divider bg-card text-cream-200')}>
          {t(libraryKindKey(playlist.kind))}
        </span>
        {status ? (
          <span className={cn(badgeBase, status.className)}>{status.label}</span>
        ) : null}
        <span className="text-xs tabular-nums text-cream-400">{details}</span>
      </div>
    </>
  )
}

const menuItemClass =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus'

function LibraryItemMenu({
  id,
  panelRef,
  panelStyle,
  placement,
  onKeyDown,
  playlist,
  deleted,
  copied,
  onCopyLink,
  onStartRename,
  onAskConfirm,
}: Readonly<{
  id: string
  panelRef: RefObject<HTMLUListElement | null>
  panelStyle: CSSProperties
  placement: string | undefined
  onKeyDown: (event: KeyboardEvent) => void
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
      ref={panelRef}
      id={id}
      aria-label={t('library.more')}
      data-popover-panel
      data-placement={placement}
      style={panelStyle}
      onKeyDown={onKeyDown}
      className={cn(popoverSurfaceClass, 'w-56 rounded-card py-1')}
    >
      {showSpotifyActions ? (
        <>
          <li>
            <button
              type="button"
              data-popover-item
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
              data-popover-item
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
          data-popover-item
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
            data-popover-item
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
  spotifyUrl,
  canPreview,
  previewOpen,
  previewId,
  onTogglePreview,
  menuOpen,
  menuId,
  onToggleMenu,
  menuRef,
  menuTriggerRef,
  menu,
}: Readonly<{
  spotifyUrl: string | null
  canPreview: boolean
  previewOpen: boolean
  previewId: string
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
    <div ref={menuRef} className="relative flex items-center gap-1.5">
      {canPreview ? (
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={previewOpen}
          aria-controls={previewOpen ? previewId : undefined}
          onClick={onTogglePreview}
        >
          {previewOpen ? t('preview.hide') : t('preview.show')}
          <ChevronDown
            aria-hidden
            className={cn(
              'size-3.5 transition-transform motion-reduce:transition-none',
              previewOpen && 'rotate-180',
            )}
          />
        </Button>
      ) : null}
      {spotifyUrl ? (
        <a
          href={spotifyUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ size: 'sm', variant: 'secondary' }))}
        >
          <ExternalLink aria-hidden className="size-3.5" />
          {t('library.openSpotify')}
        </a>
      ) : null}
      <Button
        ref={menuTriggerRef}
        size="sm"
        variant="ghost"
        aria-label={t('library.more')}
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={onToggleMenu}
        className={cn('w-8 px-0', menuOpen && 'bg-hover text-cream-50')}
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </Button>
      {menuOpen ? menu : null}
    </div>
  )
}

function LibraryItemPreviewPanel({
  id,
  loading,
  detail,
}: Readonly<{
  id: string
  loading: boolean
  detail: Awaited<ReturnType<typeof api.getPlaylist>> | undefined
}>) {
  if (loading) {
    return (
      <div id={id} className="mt-4 border-t border-divider pt-4">
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      </div>
    )
  }
  if (!detail) return null
  return (
    <div id={id} className="mt-4 border-t border-divider pt-4">
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
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(playlist.name)
  const [copied, setCopied] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const menu = usePopover<HTMLUListElement>({ align: 'end' })
  const { open: menuOpen, setOpen: setMenuOpen } = menu
  const menuId = useId()
  const previewId = useId()
  const deleted = playlist.missingOnSpotify
  const canPreview = !deleted && Boolean(playlist.spotifyId)

  useEffect(() => setNameDraft(playlist.name), [playlist.name])

  useEffect(() => {
    if (!selecting) return
    setMenuOpen(false)
    setPreviewOpen(false)
    setRenaming(false)
  }, [selecting, setMenuOpen])


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
    menu.triggerRef.current?.focus()
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

  const title = libraryDisplayTitle(playlist, t)
  const imageUrl = resolveCoverImage(playlist)
  const cover = <LibraryItemCover imageUrl={imageUrl} deleted={deleted} />
  const meta = (
    <LibraryItemMeta
      playlist={playlist}
      title={title}
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
        itemBorderClass(selecting, selected),
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {selecting ? (
          <button
            type="button"
            onClick={() => onToggleSelect(playlist.id)}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-3 rounded-control text-left',
              focusRing,
            )}
            aria-pressed={selected}
            aria-label={t('library.selectItem', { name: title })}
          >
            <input
              type="checkbox"
              checked={selected}
              readOnly
              tabIndex={-1}
              className="pointer-events-none size-4 shrink-0 accent-amber-500"
              aria-hidden
            />
            {cover}
            <div className="min-w-0 flex-1 space-y-1.5">{meta}</div>
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {cover}
            <div className="min-w-0 flex-1 space-y-1.5">{meta}</div>
          </div>
        )}

        {!selecting ? (
          <LibraryItemActions
            spotifyUrl={deleted ? null : playlist.spotifyUrl}
            canPreview={canPreview}
            previewOpen={previewOpen}
            previewId={previewId}
            onTogglePreview={() => setPreviewOpen((open) => !open)}
            menuOpen={menuOpen}
            menuId={menuId}
            onToggleMenu={menu.toggle}
            menuRef={menu.rootRef}
            menuTriggerRef={menu.triggerRef}
            menu={
              <LibraryItemMenu
                id={menuId}
                panelRef={menu.panelRef}
                panelStyle={menu.panelStyle}
                placement={menu.placement}
                onKeyDown={menu.onPanelKeyDown}
                playlist={playlist}
                deleted={deleted}
                copied={copied}
                onCopyLink={() => void copyLink()}
                onStartRename={() => {
                  setMenuOpen(false)
                  setRenaming(true)
                }}
                onAskConfirm={(confirm) => {
                  menu.close()
                  onAskConfirm(confirm)
                }}
              />
            }
          />
        ) : null}
      </div>
      {!selecting && previewOpen && canPreview ? (
        <LibraryItemPreviewPanel
          id={previewId}
          loading={detailQuery.isLoading}
          detail={detailQuery.data}
        />
      ) : null}
    </li>
  )
}

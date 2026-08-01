import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
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

export function LibraryItem({
  playlist,
  selecting,
  selected,
  onToggleSelect,
  onAskConfirm,
}: {
  playlist: PlaylistSummary
  selecting: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  onAskConfirm: (confirm: PendingLibraryConfirm) => void
}) {
  const t = useT()
  const locale = useLocaleStore((state) => state.locale)
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

  const seedImageUrl = playlist.seeds
    .flatMap((seed) =>
      seed.type === 'track' || !seed.imageUrl ? [] : [seed.imageUrl],
    )
    .at(0)
  const imageUrl = playlist.imageUrl ?? seedImageUrl ?? null
  const statusLabel =
    playlist.status === 'COMPLETED'
      ? t('library.statusActive')
      : playlist.status === 'PENDING'
        ? t('library.statusPending')
        : t('library.statusFailed')

  const cover = (
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

  const meta = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-cream-400">
          {formatDate(playlist.createdAt, locale)}
        </span>
        <span
          className={cn(
            'rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase',
            deleted
              ? 'border-red-800/50 bg-red-950/50 text-red-300'
              : statusStyles(playlist.status),
          )}
        >
          {deleted ? t('library.deleted') : statusLabel}
        </span>
      </div>
      {renaming && !selecting ? (
        <div className="flex max-w-md flex-wrap gap-2">
          <Input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitRename()
              if (event.key === 'Escape') setRenaming(false)
            }}
            autoFocus
          />
          <Button size="sm" loading={rename.isPending} onClick={submitRename}>
            {t('library.save')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRenaming(false)}
          >
            {t('common.cancel')}
          </Button>
        </div>
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

  return (
    <li
      className={cn(
        'group animate-fade-up rounded-xl border bg-gradient-to-br from-charcoal-800/75 to-charcoal-900/50 p-4 transition-all',
        selecting && selected
          ? 'border-amber-500/55 bg-amber-500/[0.12] ring-1 ring-amber-500/25'
          : selecting
            ? 'border-cream-200/15 hover:border-amber-500/35'
            : deleted
              ? 'border-red-900/35 opacity-90'
              : 'border-cream-200/12 hover:border-amber-500/30',
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
          <div ref={menuRef} className="relative flex items-center gap-2">
            {canPreview ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPreviewOpen((open) => !open)}
              >
                {previewOpen ? t('preview.hide') : t('preview.show')}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('library.more')}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal className="size-4" />
            </Button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-10 mt-1 w-56 rounded-lg border border-cream-200/10 bg-charcoal-800 py-1 shadow-xl"
              >
                {playlist.spotifyUrl && !deleted ? (
                  <>
                    <a
                      href={playlist.spotifyUrl}
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
                      onClick={() => void copyLink()}
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
                      onClick={() => {
                        setMenuOpen(false)
                        setRenaming(true)
                      }}
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
                  onClick={() =>
                    onAskConfirm({ kind: 'delete', playlist })
                  }
                >
                  <Trash2 className="size-3.5" />
                  {t('library.removeFromLibrary')}
                </button>
                {!deleted && playlist.spotifyId ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-300"
                    onClick={() =>
                      onAskConfirm({ kind: 'purge', playlist })
                    }
                  >
                    <Trash2 className="size-3.5" />
                    {t('library.purgeSpotify')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {!selecting && previewOpen && canPreview ? (
        <div className="mt-4 border-t border-cream-200/10 pt-4">
          {detailQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : detailQuery.data ? (
            <Suspense
              fallback={
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              }
            >
              <PlaylistDetail playlist={detailQuery.data} />
            </Suspense>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

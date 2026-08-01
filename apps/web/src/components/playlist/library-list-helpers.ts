import type { BulkLibraryAction, PlaylistSummary } from '@blendify/contracts'
import type { PendingLibraryConfirm } from '@/components/playlist/library-types'
import type { MessageKey } from '@/i18n/messages'

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

export type ConfirmCopy = {
  title: string
  description: string
  danger: boolean
}

function deleteConfirmKey(
  purge: boolean,
  missingOnSpotify: boolean,
):
  | 'library.purgeSpotifyConfirm'
  | 'library.deleteConfirmDeleted'
  | 'library.deleteConfirmActive' {
  if (purge) return 'library.purgeSpotifyConfirm'
  if (missingOnSpotify) return 'library.deleteConfirmDeleted'
  return 'library.deleteConfirmActive'
}

export function buildConfirmCopy(
  pending: PendingLibraryConfirm | null,
  t: Translate,
): ConfirmCopy | null {
  if (!pending) return null
  if (pending.kind === 'alert') {
    return {
      title: pending.title,
      description: pending.description,
      danger: false,
    }
  }
  if (pending.kind === 'bulk') {
    return buildBulkConfirmCopy(pending, t)
  }
  return buildSingleConfirmCopy(pending, t)
}

function buildBulkConfirmCopy(
  pending: Extract<PendingLibraryConfirm, { kind: 'bulk' }>,
  t: Translate,
): ConfirmCopy {
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

function buildSingleConfirmCopy(
  pending: Extract<PendingLibraryConfirm, { kind: 'delete' | 'purge' }>,
  t: Translate,
): ConfirmCopy {
  const purge = pending.kind === 'purge'
  return {
    title: t(purge ? 'library.purgeTitle' : 'library.deleteTitle'),
    description: t(
      deleteConfirmKey(purge, pending.playlist.missingOnSpotify),
      { name: pending.playlist.name },
    ),
    danger: true,
  }
}

export function toggleIdInSet(current: Set<string>, id: string): Set<string> {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function visibleSelectionState(
  playlists: PlaylistSummary[],
  selectedIds: Set<string>,
) {
  const selectedPlaylists = playlists.filter((playlist) =>
    selectedIds.has(playlist.id),
  )
  const selectedActive = selectedPlaylists.filter(
    (playlist) => !playlist.missingOnSpotify,
  )
  const allVisibleSelected =
    playlists.length > 0 &&
    playlists.every((playlist) => selectedIds.has(playlist.id))

  return { selectedPlaylists, selectedActive, allVisibleSelected }
}

export type BulkPendingInput = {
  action: BulkLibraryAction
  playlists: PlaylistSummary[]
}

export function toBulkPending({
  action,
  playlists,
}: BulkPendingInput): PendingLibraryConfirm {
  return {
    kind: 'bulk',
    action,
    playlistIds: playlists.map(({ id }) => id),
    count: playlists.length,
  }
}

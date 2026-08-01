import type {
  BulkLibraryAction,
  PlaylistSummary,
} from '@blendify/contracts'

export type PendingLibraryConfirm =
  | {
      kind: 'delete' | 'purge'
      playlist: PlaylistSummary
    }
  | {
      kind: 'bulk'
      action: BulkLibraryAction
      playlistIds: string[]
      count: number
    }
  | {
      kind: 'alert'
      title: string
      description: string
    }

import { create } from 'zustand'
import type {
  GenerateDiscoverRequest,
  GenerateMixRequest,
  GenerationProgress,
} from '@/lib/api'
import type { AppMode } from '@/lib/capabilities'
import type {
  GenerationOutcome,
  SpotifyPublication,
} from '@/lib/playlist-generation'

export type PlaylistRunFeature = 'mix' | 'discover'

export type PlaylistRunSpec = {
  mode: AppMode
  publication: SpotifyPublication
  coverFailed: boolean
} & (
  | { feature: 'mix'; request: GenerateMixRequest }
  | { feature: 'discover'; request: GenerateDiscoverRequest }
)

export type PlaylistRunStatus =
  | { phase: 'active'; progress: GenerationProgress | null }
  | { phase: 'succeeded'; outcome: GenerationOutcome }
  | { phase: 'failed'; error: unknown }
  | { phase: 'uncertain'; error: unknown }

export type PlaylistRun = {
  id: number
  spec: PlaylistRunSpec
  status: PlaylistRunStatus
  seen: boolean
}

type PlaylistRunState = {
  lastId: number
  run: PlaylistRun | null
  controller: AbortController | null
  begin: (spec: PlaylistRunSpec) => { id: number; signal: AbortSignal } | null
  reportProgress: (id: number, progress: GenerationProgress) => void
  succeed: (id: number, outcome: GenerationOutcome) => boolean
  fail: (id: number, error: unknown, uncertain: boolean) => boolean
  markSeen: (id: number) => void
  discard: () => void
}

function isActiveRun(run: PlaylistRun | null, id: number): run is PlaylistRun {
  return run?.id === id && run.status.phase === 'active'
}

export const usePlaylistRunStore = create<PlaylistRunState>((set, get) => ({
  lastId: 0,
  run: null,
  controller: null,
  begin: (spec) => {
    const { run, lastId } = get()
    if (run?.status.phase === 'active') {
      return null
    }
    const controller = new AbortController()
    const id = lastId + 1
    set({
      lastId: id,
      controller,
      run: { id, spec, status: { phase: 'active', progress: null }, seen: false },
    })
    return { id, signal: controller.signal }
  },
  reportProgress: (id, progress) => {
    const { run } = get()
    if (!isActiveRun(run, id)) {
      return
    }
    set({ run: { ...run, status: { phase: 'active', progress } } })
  },
  succeed: (id, outcome) => {
    const { run } = get()
    if (!isActiveRun(run, id)) {
      return false
    }
    set({
      controller: null,
      run: { ...run, seen: false, status: { phase: 'succeeded', outcome } },
    })
    return true
  },
  fail: (id, error, uncertain) => {
    const { run } = get()
    if (!isActiveRun(run, id)) {
      return false
    }
    set({
      controller: null,
      run: {
        ...run,
        seen: false,
        status: { phase: uncertain ? 'uncertain' : 'failed', error },
      },
    })
    return true
  },
  markSeen: (id) => {
    const { run } = get()
    if (run?.id === id && !run.seen) {
      set({ run: { ...run, seen: true } })
    }
  },
  discard: () => {
    get().controller?.abort()
    set({ run: null, controller: null })
  },
}))

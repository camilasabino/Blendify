import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { GenerationProgress } from '@/lib/api'
import type { GenerationOutcome } from '@/lib/playlist-generation'
import {
  rerunPlaylistRun,
  startPlaylistRun,
} from '@/lib/playlist-run-coordinator'
import {
  usePlaylistRunStore,
  type PlaylistRun,
  type PlaylistRunFeature,
  type PlaylistRunSpec,
} from '@/stores/playlist-run-store'

export type PlaylistRunFailure = { error: unknown; isOutcomeUncertain: boolean }

export type PlaylistRunView = {
  run: PlaylistRun | null
  isActive: boolean
  busyFeature: PlaylistRunFeature | null
  result: GenerationOutcome | null
  progress: GenerationProgress | null
  failure: PlaylistRunFailure | null
  start: (spec: PlaylistRunSpec) => boolean
  rerun: () => boolean
  dismiss: () => void
}

export function usePlaylistRun(feature: PlaylistRunFeature): PlaylistRunView {
  const queryClient = useQueryClient()
  const current = usePlaylistRunStore((state) => state.run)
  const run = current?.spec.feature === feature ? current : null
  const activeFeature =
    current?.status.phase === 'active' ? current.spec.feature : null
  const status = run?.status

  useEffect(() => {
    if (run && run.status.phase !== 'active' && !run.seen) {
      usePlaylistRunStore.getState().markSeen(run.id)
    }
  }, [run])

  useEffect(
    () => () => {
      const { run: latest, discard: discardRun } = usePlaylistRunStore.getState()
      if (latest?.spec.feature === feature && latest.spec.mode === 'guest') {
        discardRun()
      }
    },
    [feature],
  )

  return {
    run,
    isActive: status?.phase === 'active',
    busyFeature: activeFeature !== feature ? activeFeature : null,
    result: status?.phase === 'succeeded' ? status.outcome : null,
    progress: status?.phase === 'active' ? status.progress : null,
    failure:
      status?.phase === 'failed' || status?.phase === 'uncertain'
        ? { error: status.error, isOutcomeUncertain: status.phase === 'uncertain' }
        : null,
    start: (spec) => startPlaylistRun(spec, queryClient),
    rerun: () => rerunPlaylistRun(queryClient),
    dismiss: () => {
      const { run: latest, discard } = usePlaylistRunStore.getState()
      if (latest?.spec.feature === feature && latest.status.phase !== 'active') {
        discard()
      }
    },
  }
}

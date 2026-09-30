import type { QueryClient } from '@tanstack/react-query'
import { isGenerationOutcomeUncertain } from '@/lib/api-error'
import {
  canRetryGeneration,
  isWriteOutcomeUnknown,
} from '@/lib/generation-failure'
import {
  runDiscoverGeneration,
  runMixGeneration,
  type GenerationOutcome,
} from '@/lib/playlist-generation'
import {
  usePlaylistRunStore,
  type PlaylistRunSpec,
} from '@/stores/playlist-run-store'
import type { GenerationProgressHandler } from '@/lib/generation-stream'

function runGeneration(
  spec: PlaylistRunSpec,
  onProgress: GenerationProgressHandler,
  signal: AbortSignal,
): Promise<GenerationOutcome> {
  const { mode, publication } = spec
  if (spec.feature === 'mix') {
    return runMixGeneration({
      mode,
      publication,
      request: spec.request,
      onProgress,
      signal,
    })
  }
  return runDiscoverGeneration({
    mode,
    publication,
    request: spec.request,
    onProgress,
    signal,
  })
}

async function executeRun(
  spec: PlaylistRunSpec,
  id: number,
  signal: AbortSignal,
  queryClient: QueryClient,
): Promise<void> {
  try {
    const outcome = await runGeneration(
      spec,
      (progress) => usePlaylistRunStore.getState().reportProgress(id, progress),
      signal,
    )
    if (!usePlaylistRunStore.getState().succeed(id, outcome)) {
      return
    }
    if (outcome.mode === 'spotify') {
      void queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
    }
  } catch (error) {
    usePlaylistRunStore
      .getState()
      .fail(id, error, spec.mode === 'spotify' && isGenerationOutcomeUncertain(error))
  }
}

export function startPlaylistRun(
  spec: PlaylistRunSpec,
  queryClient: QueryClient,
): boolean {
  const started = usePlaylistRunStore.getState().begin(spec)
  if (!started) {
    return false
  }
  void executeRun(spec, started.id, started.signal, queryClient)
  return true
}

export function rerunPlaylistRun(queryClient: QueryClient): boolean {
  const { run } = usePlaylistRunStore.getState()
  if (!run || run.status.phase === 'active' || run.status.phase === 'uncertain') {
    return false
  }
  if (run.status.phase === 'failed' && !canRetryGeneration(run.status.error, false)) {
    return false
  }
  return startPlaylistRun(run.spec, queryClient)
}

export function recreateUncertainPlaylistRun(queryClient: QueryClient): boolean {
  const { run } = usePlaylistRunStore.getState()
  if (
    run?.status.phase !== 'uncertain' ||
    !isWriteOutcomeUnknown(run.status.error, true)
  ) {
    return false
  }
  return startPlaylistRun(run.spec, queryClient)
}

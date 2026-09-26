import {
  api,
  type GenerateDiscoverRequest,
  type GenerateMixRequest,
  type GeneratedPlaylistDto,
  type PlaylistDetail,
} from '@/lib/api'
import type { AppMode } from '@/lib/capabilities'
import type { GenerationProgressHandler } from '@/lib/generation-stream'

export type GenerationOutcome =
  | { mode: 'spotify'; playlist: PlaylistDetail }
  | { mode: 'guest'; playlist: GeneratedPlaylistDto }

export type SpotifyPublication = {
  coverImageBase64?: string
  persistToLibrary: boolean
}

export type GenerationRun<TRequest> = {
  mode: AppMode
  request: TRequest
  publication: SpotifyPublication
  onProgress?: GenerationProgressHandler
  signal?: AbortSignal
}

export async function runMixGeneration({
  mode,
  request,
  publication,
  onProgress,
  signal,
}: GenerationRun<GenerateMixRequest>): Promise<GenerationOutcome> {
  if (mode === 'spotify') {
    const playlist = await api.createMix(
      { ...request, ...publication },
      { onProgress, signal },
    )
    return { mode, playlist }
  }
  const playlist = await api.generateMix(request, { onProgress, signal })
  return { mode, playlist }
}

export async function runDiscoverGeneration({
  mode,
  request,
  publication,
  onProgress,
  signal,
}: GenerationRun<GenerateDiscoverRequest>): Promise<GenerationOutcome> {
  if (mode === 'spotify') {
    const playlist = await api.createDiscover(
      { ...request, ...publication },
      { onProgress, signal },
    )
    return { mode, playlist }
  }
  const playlist = await api.generateDiscover(request, { onProgress, signal })
  return { mode, playlist }
}

export function outcomeTrackCount(outcome: GenerationOutcome): number {
  return outcome.mode === 'spotify'
    ? outcome.playlist.trackCount
    : outcome.playlist.tracks.length
}

export function outcomeDurationMs(outcome: GenerationOutcome): number {
  if (outcome.mode === 'spotify') return outcome.playlist.totalDurationMs
  return outcome.playlist.tracks.reduce(
    (total, track) => total + track.durationMs,
    0,
  )
}

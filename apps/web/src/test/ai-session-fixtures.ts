import type {
  AiGenerationDto,
  AiGenerationFailureDto,
  AiGenerationUnmetConstraint,
  AiIntentSummary,
  AiSessionDestinationDto,
  AiSessionDto,
  AiSessionStateDto,
  TrackDto,
} from '@blendify/contracts'

export const AI_SESSION_ID = 'session-token'
export const AI_PROMPT = '20 deep cuts from Radiohead and Interpol, no Coldplay'
const EXPIRES_AT = '2026-09-27T12:30:00.000Z'

export const aiIntent: AiIntentSummary = {
  kind: 'artist_mix',
  artists: ['Radiohead', 'Interpol'],
  genres: [],
  seedTrack: null,
  targetTrackCount: 20,
  targetDurationMinutes: null,
  mood: null,
  popularity: 'rarities',
  orderMode: null,
  excludeArtists: ['Coldplay'],
  excludeTracks: [],
  unmetConstraints: [{ category: 'activity', userText: 'for a long run' }],
}

export function aiTrack(index: number): TrackDto {
  return {
    id: `track-${index}`,
    name: `Song ${index}`,
    artistId: 'artist-radiohead',
    artistName: 'Radiohead',
    artists: [{ id: 'artist-radiohead', name: 'Radiohead' }],
    albumName: 'Kid A',
    durationMs: 180_000,
    popularity: 20,
    uri: `spotify:track:track-${index}`,
    externalUrl: `https://open.spotify.com/track/track-${index}`,
  }
}

export function aiTracks(count: number): TrackDto[] {
  return Array.from({ length: count }, (_, index) => aiTrack(index + 1))
}

export function reviewedAiSession(intent: AiIntentSummary = aiIntent): AiSessionDto {
  return {
    sessionId: AI_SESSION_ID,
    expiresAt: EXPIRES_AT,
    status: 'ready',
    intent,
    clarification: null,
  }
}

export function aiGeneration(
  overrides: Partial<{
    intent: AiIntentSummary
    tracks: TrackDto[]
    unmetConstraints: AiGenerationUnmetConstraint[]
    transferAvailable: boolean
  }> = {},
): AiGenerationDto {
  const tracks = overrides.tracks ?? aiTracks(20)
  return {
    sessionId: AI_SESSION_ID,
    expiresAt: EXPIRES_AT,
    status: 'generated',
    intent: overrides.intent ?? aiIntent,
    playlist: {
      name: 'Blendify · Mix · Radiohead + Interpol',
      description: 'Made with Blendify from Radiohead and Interpol.',
      seeds: [
        { type: 'artist', id: 'artist-radiohead', name: 'Radiohead' },
        { type: 'artist', id: 'artist-interpol', name: 'Interpol' },
      ],
      tracks,
    },
    trackCount: tracks.length,
    durationMs: tracks.reduce((total, track) => total + track.durationMs, 0),
    unmetConstraints: overrides.unmetConstraints ?? [],
    transferAvailable: overrides.transferAvailable ?? true,
  }
}

export function reviewedAiSessionState(intent: AiIntentSummary = aiIntent): AiSessionStateDto {
  return { ...reviewedAiSession(intent), execution: null, destination: null, refinement: null }
}

export function generatingAiSessionState(): AiSessionStateDto {
  return { ...reviewedAiSession(), execution: { status: 'generating' }, destination: null, refinement: null }
}

export function generatedAiSessionState(
  generation = aiGeneration(),
  destination: AiSessionDestinationDto | null = null,
): AiSessionStateDto {
  return {
    ...reviewedAiSession(generation.intent),
    execution: {
      status: 'generated',
      playlist: generation.playlist,
      trackCount: generation.trackCount,
      durationMs: generation.durationMs,
      unmetConstraints: generation.unmetConstraints,
      transferAvailable: generation.transferAvailable,
    },
    destination,
    refinement: null,
  }
}

export function failedAiSessionState(error: AiGenerationFailureDto): AiSessionStateDto {
  return {
    ...reviewedAiSession(),
    execution: { status: 'generation_failed', error },
    destination: null,
    refinement: null,
  }
}

export function storeAiSession(prompt = AI_PROMPT, playlistTitle: string | null = null) {
  sessionStorage.setItem(
    'blendify.aiSession',
    JSON.stringify({ sessionId: AI_SESSION_ID, prompt, playlistTitle }),
  )
}

import type {
  AiGenerationDto,
  AiGenerationFailureDto,
  AiGenerationUnmetConstraint,
  AiIntentSummary,
  AiRefinementDto,
  AiSessionDestinationDto,
  AiSessionCreatedDto,
  AiSessionDto,
  AiSessionStateDto,
  TrackDto,
} from '@blendify/contracts'

export const AI_SESSION_ID = 'session-id'
export const AI_ACCESS_KEY = 'access-key'
export const AI_PROMPT = '20 deep cuts from Radiohead and Interpol, no Coldplay'
const EXPIRES_AT = '2026-09-27T12:30:00.000Z'

export const aiIntent: AiIntentSummary = {
  kind: 'artist_mix',
  artists: ['Radiohead', 'Interpol'],
  genres: [],
  filters: { region: null },
  seedTrack: null,
  targetTrackCount: 20,
  targetDurationMinutes: null,
  mood: null,
  moodNotAppliedReason: null,
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

export function createdAiSession(intent: AiIntentSummary = aiIntent): AiSessionCreatedDto {
  return { ...reviewedAiSession(intent), accessKey: AI_ACCESS_KEY }
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
  return { ...reviewedAiSession(intent), execution: null, destination: null, preservation: null, refinement: null }
}

export function generatingAiSessionState(): AiSessionStateDto {
  return { ...reviewedAiSession(), execution: { status: 'generating' }, destination: null, preservation: null, refinement: null }
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
    preservation: { firstTracks: null, positions: [], artists: [], preservedPositions: [] },
    refinement: null,
  }
}

export function failedAiSessionState(error: AiGenerationFailureDto): AiSessionStateDto {
  return {
    ...reviewedAiSession(),
    execution: { status: 'generation_failed', error },
    destination: null,
    preservation: null,
    refinement: null,
  }
}

export function storeAiSession(prompt = AI_PROMPT, playlistTitle: string | null = null) {
  sessionStorage.setItem(
    'blendify.aiSession',
    JSON.stringify({ sessionId: AI_SESSION_ID, accessKey: AI_ACCESS_KEY, prompt, playlistTitle }),
  )
}

export const AI_REFINEMENT_ID = 'refinement-1'

export function proposedTrack(index: number): TrackDto {
  return { ...aiTrack(index), id: `proposed-${index}`, name: `Proposed ${index}` }
}

export function candidateReadyRefinement(
  id = AI_REFINEMENT_ID,
): Extract<AiRefinementDto, { status: 'candidate_ready' }> {
  const tracks = [...aiTracks(18), proposedTrack(1), proposedTrack(2)]
  return {
    id,
    status: 'candidate_ready',
    intent: { ...aiIntent, popularity: 'popular' },
    preservation: { firstTracks: 2, positions: [], artists: [] },
    notApplied: [{ category: 'energy', userText: 'more energetic' }],
    candidate: {
      playlist: { ...aiGeneration().playlist, tracks },
      trackCount: tracks.length,
      durationMs: tracks.length * 180_000,
      unmetConstraints: [],
    },
    diff: {
      tracks: {
        added: [
          { trackId: 'proposed-1', position: 19 },
          { trackId: 'proposed-2', position: 20 },
        ],
        removed: [
          { trackId: 'track-19', position: 19 },
          { trackId: 'track-20', position: 20 },
        ],
        moved: [],
        retainedCount: 18,
        replacedCount: 2,
        before: { trackCount: 20, durationMs: 3_600_000 },
        after: { trackCount: 20, durationMs: 3_600_000 },
      },
      intent: [{ field: 'popularity', from: 'rarities', to: 'popular' }],
      preservedPositions: [1, 2],
    },
  }
}

export function settingsOnlyRefinement(
  id = AI_REFINEMENT_ID,
): Extract<AiRefinementDto, { status: 'candidate_ready' }> {
  const tracks = aiTracks(20)
  return {
    id,
    status: 'candidate_ready',
    intent: { ...aiIntent, excludeArtists: [...aiIntent.excludeArtists, 'Muse'] },
    preservation: { firstTracks: null, positions: [], artists: [] },
    notApplied: [],
    candidate: {
      playlist: { ...aiGeneration().playlist, tracks },
      trackCount: tracks.length,
      durationMs: tracks.length * 180_000,
      unmetConstraints: [],
    },
    diff: {
      tracks: {
        added: [],
        removed: [],
        moved: [],
        retainedCount: tracks.length,
        replacedCount: 0,
        before: { trackCount: 20, durationMs: 3_600_000 },
        after: { trackCount: 20, durationMs: 3_600_000 },
      },
      intent: [{ field: 'excludeArtists', added: ['Muse'], removed: [] }],
      preservedPositions: [],
    },
  }
}

export function appliedCandidateState(): AiSessionStateDto {
  const candidate = candidateReadyRefinement()
  return {
    ...generatedAiSessionState(
      aiGeneration({ intent: candidate.intent, tracks: candidate.candidate.playlist.tracks }),
    ),
    preservation: {
      ...candidate.preservation,
      preservedPositions: candidate.diff.preservedPositions,
    },
  }
}

export function pendingAiSessionState(refinement: AiRefinementDto): AiSessionStateDto {
  return { ...generatedAiSessionState(), refinement }
}

import type {
  AiClarification,
  AiGenerationFailureDto,
  AiGenerationUnmetConstraint,
  AiIntentSummary,
  AiRefinementDto,
  AiSessionDestinationDto,
  AiSessionStateDto,
  TrackDto,
} from '@blendify/contracts'

export const AI_REVIEW_SESSION_ID = 'visual-review-session'
export const AI_REVIEW_PROMPT =
  'About an hour of happy deep cuts from Radiohead and Interpol, 30 songs, no Coldplay, for a long run'
export const AI_REVIEW_COVER_URL = 'https://artwork.blendify.test/cover.svg'

const EXPIRES_AT = '2099-01-01T00:00:00.000Z'
const TRACK_TITLES = [
  'Paper Satellites',
  'Glass Harbour',
  'Northbound Static',
  'The Quiet Engine',
  'Lanterns Over Tin',
  'Midnight Cartography',
  'Signal and Salt',
  'A Long Way to Blue',
  'Copper Weather',
  'Hollow Parade',
]
const SYNTHETIC_ARTISTS = ['The Lantern Cartel', 'Mira Vale', 'Northern Arcade']

export const reviewIntent: AiIntentSummary = {
  kind: 'artist_mix',
  artists: ['Radiohead', 'Interpol'],
  genres: [],
  seedTrack: null,
  targetTrackCount: 30,
  targetDurationMinutes: 60,
  mood: 'happy',
  popularity: 'rarities',
  orderMode: null,
  excludeArtists: ['Coldplay'],
  excludeTracks: [],
  unmetConstraints: [],
}

export const unsupportedIntent: AiIntentSummary = {
  ...reviewIntent,
  unmetConstraints: [
    { category: 'activity', userText: 'for a long run' },
    { category: 'era', userText: 'from the early 2000s' },
  ],
}

export const clarification: AiClarification = {
  reason: 'too_many_seeds',
  seedType: 'artist',
  limit: 1,
  names: ['Radiohead', 'Interpol'],
  unsupportedConstraints: [],
  options: [
    { id: 'keep_seed:artist:0', type: 'keep_seed', seedType: 'artist', label: 'Radiohead' },
    { id: 'keep_seed:artist:1', type: 'keep_seed', seedType: 'artist', label: 'Interpol' },
    { id: 'set_kind:artist_mix', type: 'set_kind', kind: 'artist_mix' },
  ],
}

function syntheticTrack(index: number): TrackDto {
  const artist = SYNTHETIC_ARTISTS[index % SYNTHETIC_ARTISTS.length]
  const title = TRACK_TITLES[index % TRACK_TITLES.length]
  return {
    id: `visual-track-${index}`,
    name: index < TRACK_TITLES.length ? title : `${title} (Reprise ${index})`,
    artistId: `visual-artist-${index % SYNTHETIC_ARTISTS.length}`,
    artistName: artist,
    artists: [{ name: artist }],
    albumName: 'Synthetic Sessions',
    durationMs: 150_000 + (index % 5) * 17_000,
    popularity: 30,
    uri: `visual:track:${index}`,
  }
}

function state(
  intent: AiIntentSummary,
  execution: AiSessionStateDto['execution'],
  destination: AiSessionDestinationDto | null = null,
): AiSessionStateDto {
  return {
    sessionId: AI_REVIEW_SESSION_ID,
    expiresAt: EXPIRES_AT,
    status: 'ready',
    intent,
    clarification: null,
    execution,
    destination,
    preservation:
      execution?.status === 'generated'
        ? { firstTracks: null, positions: [], artists: [], preservedPositions: [] }
        : null,
    refinement: null,
  }
}

export function clarificationState(): AiSessionStateDto {
  return {
    sessionId: AI_REVIEW_SESSION_ID,
    expiresAt: EXPIRES_AT,
    status: 'needs_clarification',
    intent: null,
    clarification,
    execution: null,
    destination: null,
    preservation: null,
    refinement: null,
  }
}

export function reviewedState(intent: AiIntentSummary = reviewIntent): AiSessionStateDto {
  return state(intent, null)
}

export function generatingState(): AiSessionStateDto {
  return state(reviewIntent, { status: 'generating' })
}

export function generatedState(
  options: {
    trackCount?: number
    requestedTrackCount?: number | null
    requestedMinutes?: number | null
    unmetConstraints?: AiGenerationUnmetConstraint[]
    withArtwork?: boolean
    transferAvailable?: boolean
    destination?: AiSessionDestinationDto | null
  } = {},
): AiSessionStateDto {
  const tracks = Array.from({ length: options.trackCount ?? 20 }, (_, index) =>
    syntheticTrack(index),
  )
  const intent: AiIntentSummary = {
    ...unsupportedIntent,
    targetTrackCount: options.requestedTrackCount ?? null,
    targetDurationMinutes: options.requestedMinutes ?? null,
  }
  return state(intent, {
    status: 'generated',
    playlist: {
      name: 'Blendify · Mix · Radiohead + Interpol',
      description: 'Made with Blendify from Radiohead and Interpol.',
      seeds: [
        { type: 'artist', id: 'visual-seed-1', name: 'Radiohead' },
        { type: 'artist', id: 'visual-seed-2', name: 'Interpol' },
      ],
      tracks,
      ...(options.withArtwork
        ? {
            coverArtwork: {
              imageUrl: AI_REVIEW_COVER_URL,
              spotifyUrl: 'https://open.spotify.com/album/visual-review',
            },
          }
        : {}),
    },
    trackCount: tracks.length,
    durationMs: tracks.reduce((total, track) => total + track.durationMs, 0),
    unmetConstraints: options.unmetConstraints ?? [],
    transferAvailable: options.transferAvailable ?? true,
  }, options.destination ?? null)
}

export function failedState(error: AiGenerationFailureDto): AiSessionStateDto {
  return state(reviewIntent, { status: 'generation_failed', error })
}

export const AI_REFINEMENT_ID = 'e2e-refinement-1'

function proposedTrack(index: number): TrackDto {
  return {
    ...syntheticTrack(index),
    id: `visual-proposed-${index}`,
    name: `Proposed Horizon ${index}`,
  }
}

type GeneratedExecution = Extract<
  NonNullable<AiSessionStateDto['execution']>,
  { status: 'generated' }
>

function generatedExecution(sessionState: AiSessionStateDto): GeneratedExecution {
  if (sessionState.execution?.status !== 'generated') {
    throw new Error('Expected a generated session fixture')
  }
  return sessionState.execution
}

export function candidateRefinement(
  base: AiSessionStateDto = generatedState(),
  id = AI_REFINEMENT_ID,
): Extract<AiRefinementDto, { status: 'candidate_ready' }> {
  const current = generatedExecution(base)
  const kept = current.playlist.tracks.slice(0, current.playlist.tracks.length - 3)
  const moved = kept.length > 4 ? [kept[3], kept[2], ...kept.slice(0, 2), ...kept.slice(4)] : kept
  const tracks = [...moved, proposedTrack(1), proposedTrack(2), proposedTrack(3)]
  const removed = current.playlist.tracks.slice(-3)
  const durationMs = tracks.reduce((total, track) => total + track.durationMs, 0)
  return {
    id,
    status: 'candidate_ready',
    intent: { ...(base.intent ?? reviewIntent), popularity: 'popular', genres: ['Argentine Rock'] },
    preservation: { firstTracks: null, positions: [5], artists: [] },
    notApplied: [{ category: 'energy', userText: 'with more energy' }],
    candidate: {
      playlist: { ...current.playlist, tracks },
      trackCount: tracks.length,
      durationMs,
      unmetConstraints: [],
    },
    diff: {
      tracks: {
        added: [1, 2, 3].map((offset) => ({
          trackId: `visual-proposed-${offset}`,
          position: kept.length + offset,
        })),
        removed: removed.map((track, index) => ({
          trackId: track.id,
          position: kept.length + index + 1,
        })),
        moved: kept.length > 4 ? [{ trackId: kept[3].id, from: 4, to: 1 }] : [],
        retainedCount: kept.length,
        replacedCount: 3,
        before: { trackCount: current.trackCount, durationMs: current.durationMs },
        after: { trackCount: tracks.length, durationMs },
      },
      intent: [
        { field: 'genres', added: ['Argentine Rock'], removed: [] },
        { field: 'popularity', from: 'rarities', to: 'popular' },
        { field: 'excludeArtists', added: ['Soda Stereo'], removed: [] },
      ],
      preservedPositions: [5],
    },
  }
}

export function pendingState(
  refinement: AiRefinementDto,
  base: AiSessionStateDto = generatedState(),
): AiSessionStateDto {
  return { ...base, refinement }
}

export function appliedState(
  refinement: Extract<AiRefinementDto, { status: 'candidate_ready' }>,
  base: AiSessionStateDto = generatedState(),
): AiSessionStateDto {
  const current = generatedExecution(base)
  return {
    ...base,
    intent: refinement.intent,
    execution: {
      ...current,
      playlist: refinement.candidate.playlist,
      trackCount: refinement.candidate.trackCount,
      durationMs: refinement.candidate.durationMs,
      unmetConstraints: refinement.candidate.unmetConstraints,
    },
    preservation: {
      ...refinement.preservation,
      preservedPositions: refinement.diff.preservedPositions,
    },
    refinement: null,
  }
}

export function refinementResult(refinement: AiRefinementDto) {
  return { sessionId: AI_REVIEW_SESSION_ID, expiresAt: EXPIRES_AT, refinement }
}

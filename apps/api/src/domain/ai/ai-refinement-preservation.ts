import { normalizeArtistName } from '@/domain/artist/artist-name-match';
import type { Track } from '@/domain/track/track.entity';
import type { AiIntent } from './ai-intent';
import type { AiPreservation } from './ai-intent-patch';
import type { AiRefinementClarification } from './ai-refinement';
import { creditedArtistKeys, matchingExclusions } from './ai-track-selection';

export type AiPreservationResolution =
  | { status: 'resolved'; positions: number[] }
  | { status: 'needs_clarification'; clarification: AiRefinementClarification };

export function resolvePreservation(input: {
  tracks: readonly Track[];
  preservation: AiPreservation;
  intent: AiIntent;
}): AiPreservationResolution {
  const { tracks, preservation, intent } = input;
  const explicit = [
    ...firstPositions(preservation.firstTracks),
    ...preservation.positions,
  ];

  if (explicit.some((position) => position < 1 || position > tracks.length)) {
    return clarify('preserved_track_out_of_range', { limit: tracks.length });
  }

  const byArtist = preservation.artists.map((name) => ({
    name,
    positions: artistPositions(tracks, name),
  }));
  const missingArtists = byArtist
    .filter((artist) => artist.positions.length === 0)
    .map((artist) => artist.name);
  if (missingArtists.length > 0) {
    return clarify('preserved_artist_not_found', { names: missingArtists });
  }

  const positions = [
    ...new Set([
      ...explicit,
      ...byArtist.flatMap((artist) => artist.positions),
    ]),
  ].sort((left, right) => left - right);

  const excludedBy = matchingExclusions({
    artists: intent.excludeArtists,
    tracks: intent.excludeTracks,
  });
  const excludedLabels = [
    ...new Set(
      positions.flatMap((position) => excludedBy(tracks[position - 1])),
    ),
  ];
  if (excludedLabels.length > 0) {
    return clarify('conflicting_changes', { names: excludedLabels });
  }

  const lastPosition = positions.at(-1);
  if (
    intent.targetTrackCount !== null &&
    lastPosition !== undefined &&
    lastPosition > intent.targetTrackCount
  ) {
    return clarify('conflicting_changes', { limit: intent.targetTrackCount });
  }

  return { status: 'resolved', positions };
}

function firstPositions(firstTracks: number | null): number[] {
  if (firstTracks === null) {
    return [];
  }
  return Array.from({ length: firstTracks }, (_, index) => index + 1);
}

function artistPositions(tracks: readonly Track[], name: string): number[] {
  const key = normalizeArtistName(name);
  if (!key) {
    return [];
  }

  return tracks.flatMap((track, index) =>
    creditedArtistKeys(track).includes(key) ? [index + 1] : [],
  );
}

function clarify(
  reason: AiRefinementClarification['reason'],
  details: { limit?: number; names?: string[] },
): AiPreservationResolution {
  return {
    status: 'needs_clarification',
    clarification: {
      reason,
      seedType: null,
      limit: details.limit ?? null,
      names: details.names ?? [],
      unsupportedConstraints: [],
    },
  };
}

import { Track } from '../track/track.entity';
import { TrackDeduplicationService } from '../services/track-deduplication.service';
import { DuplicateTrackSpecification } from '../services/specifications/duplicate-track.specification';
import { createOrderingStrategy } from '../services/strategies/track-ordering.strategy';
import type { TrackOrderMode } from '@blendify/contracts';
import { MAX_TRACKS } from '../constants';

/**
 * How many tracks to pull per seed artist while building the candidate pool.
 * Keep this low so one act cannot dominate a broad genre mix.
 */
export function tracksPerSeedArtist(
  tracksPerSeed: number,
  seedArtistCount: number,
): number {
  if (seedArtistCount <= 0) return 2;
  // Aim for ~1–2 tracks/artist in the final list; fetch a thin buffer.
  const fair = Math.ceil(tracksPerSeed / seedArtistCount);
  return Math.min(3, Math.max(2, fair));
}

/**
 * Pick up to `needed` tracks while spreading across real Spotify artists.
 * Starts at 1 track/artist and relaxes the cap only if we would underfill.
 */
export function selectTracksWithArtistDiversity(
  tracks: Track[],
  needed: number,
  options: { maxPerArtist?: number } = {},
): Track[] {
  if (needed <= 0 || tracks.length === 0) return [];

  const hardCap = Math.max(1, options.maxPerArtist ?? 3);
  const byArtist = new Map<string, Track[]>();

  for (const track of tracks) {
    const artistId = track.artistId.getValue();
    const bucket = byArtist.get(artistId);
    if (bucket) bucket.push(track);
    else byArtist.set(artistId, [track]);
  }

  const artistIds = Array.from(byArtist.keys());
  if (artistIds.length === 0) return [];

  for (let maxPerArtist = 1; maxPerArtist <= hardCap; maxPerArtist += 1) {
    const picked = roundRobinPick(byArtist, artistIds, needed, maxPerArtist);
    if (picked.length >= needed || maxPerArtist === hardCap) {
      return picked.slice(0, needed);
    }
  }

  return [];
}

function roundRobinPick(
  byArtist: Map<string, Track[]>,
  artistIds: string[],
  needed: number,
  maxPerArtist: number,
): Track[] {
  const cursors = new Map<string, number>(artistIds.map((id) => [id, 0]));
  const taken = new Map<string, number>(artistIds.map((id) => [id, 0]));
  const result: Track[] = [];

  let progress = true;
  while (result.length < needed && progress) {
    progress = false;
    for (const artistId of artistIds) {
      if (result.length >= needed) break;
      const used = taken.get(artistId) ?? 0;
      if (used >= maxPerArtist) continue;
      const queue = byArtist.get(artistId) ?? [];
      const cursor = cursors.get(artistId) ?? 0;
      if (cursor >= queue.length) continue;
      result.push(queue[cursor]);
      cursors.set(artistId, cursor + 1);
      taken.set(artistId, used + 1);
      progress = true;
    }
  }

  return result;
}

export interface GenreGenerationInput {
  tracksByGenre: Map<string, Track[]>;
  tracksPerSeed: number;
  orderMode: TrackOrderMode;
}

export interface GenreGenerationResult {
  tracks: Track[];
  allocation: Map<string, number>;
}

export class GenrePlaylistGenerationService {
  constructor(
    private readonly deduplication: TrackDeduplicationService = new TrackDeduplicationService(),
    private readonly duplicateSpec: DuplicateTrackSpecification = new DuplicateTrackSpecification(),
  ) {}

  generate(input: GenreGenerationInput): GenreGenerationResult {
    const allocation = new Map<string, number>();
    const selectedByGenre = new Map<string, Track[]>();

    for (const [genreId, tracks] of input.tracksByGenre.entries()) {
      const cleaned = this.deduplication.deduplicate(tracks);
      const diverse = selectTracksWithArtistDiversity(
        cleaned,
        input.tracksPerSeed,
        { maxPerArtist: 3 },
      );
      allocation.set(genreId, diverse.length);
      selectedByGenre.set(genreId, diverse);
    }

    const seen = new Set<string>();
    const byRealArtist = new Map<string, Track[]>();

    for (const tracks of selectedByGenre.values()) {
      for (const track of tracks) {
        const key = this.duplicateSpec.keyFor(track);
        if (seen.has(key)) continue;
        seen.add(key);
        const artistId = track.artistId.getValue();
        const bucket = byRealArtist.get(artistId);
        if (bucket) bucket.push(track);
        else byRealArtist.set(artistId, [track]);
      }
    }

    const ordered = createOrderingStrategy(input.orderMode).order(byRealArtist);

    return {
      tracks: ordered.slice(0, Math.min(MAX_TRACKS, ordered.length)),
      allocation,
    };
  }
}

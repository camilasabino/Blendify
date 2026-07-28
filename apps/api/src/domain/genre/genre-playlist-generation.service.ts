import { Track } from '../track/track.entity';
import { TrackDeduplicationService } from '../services/track-deduplication.service';
import { DuplicateTrackSpecification } from '../services/specifications/duplicate-track.specification';
import {
  AllocationStrategy,
  EquitableAllocationStrategy,
} from '../services/strategies/allocation.strategy';
import { createOrderingStrategy } from '../services/strategies/track-ordering.strategy';
import { MixMode } from './mix-mode';
import { CuratedGenre } from './curated-genres';
import { MAX_TRACKS } from '../constants';

export interface GenreTrackQuery {
  genre: CuratedGenre;
  queries: string[];
  offsets: number[];
  maxSearches: number;
  rank: 'popularity_desc' | 'popularity_asc' | 'as_found';
  minPopularity?: number;
}

export function buildGenreQueries(
  genre: CuratedGenre,
  mode: MixMode,
): GenreTrackQuery {
  const g = genre.spotifyGenre;
  const name = genre.name;

  switch (mode) {
    case MixMode.POPULAR:
      return {
        genre,
        queries: [`genre:"${g}"`, `genre:"${g}" year:2020-2026`],
        offsets: [0],
        maxSearches: 2,
        rank: 'popularity_desc',
        minPopularity: 40,
      };
    case MixMode.BALANCED:
      return {
        genre,
        queries: [`genre:"${g}"`],
        offsets: [0, 10],
        maxSearches: 2,
        rank: 'as_found',
        minPopularity: 15,
      };
    case MixMode.RARITIES:
      return {
        genre,
        queries: [`genre:"${g}"`, `${name} underground`],
        offsets: [10],
        maxSearches: 2,
        rank: 'popularity_asc',
      };
    case MixMode.MOOD_ENERGETIC:
      return {
        genre,
        queries: [`genre:"${g}" energetic`, `genre:"${g}" dance`],
        offsets: [0],
        maxSearches: 2,
        rank: 'popularity_desc',
        minPopularity: 25,
      };
    case MixMode.MOOD_CHILL:
      return {
        genre,
        queries: [`genre:"${g}" chill`, `genre:"${g}" acoustic`],
        offsets: [0],
        maxSearches: 2,
        rank: 'popularity_desc',
        minPopularity: 25,
      };
    case MixMode.MOOD_MELANCHOLIC:
      return {
        genre,
        queries: [`genre:"${g}" sad`, `genre:"${g}" ballad`],
        offsets: [0],
        maxSearches: 2,
        rank: 'popularity_desc',
        minPopularity: 25,
      };
  }
}

export interface GenreGenerationInput {
  tracksByGenre: Map<string, Track[]>;
  songsPerGenre: number;
  shuffle: boolean;
}

export interface GenreGenerationResult {
  tracks: Track[];
  allocation: Map<string, number>;
}

export class GenrePlaylistGenerationService {
  constructor(
    private readonly deduplication: TrackDeduplicationService = new TrackDeduplicationService(),
    private readonly duplicateSpec: DuplicateTrackSpecification = new DuplicateTrackSpecification(),
    private readonly allocationStrategy: AllocationStrategy = new EquitableAllocationStrategy(),
  ) {}

  generate(input: GenreGenerationInput): GenreGenerationResult {
    const cleaned = new Map<string, Track[]>();
    for (const [genreId, tracks] of input.tracksByGenre.entries()) {
      cleaned.set(genreId, this.deduplication.deduplicate(tracks));
    }

    const genreIds = Array.from(cleaned.keys());
    const availableByArtist = new Map<string, number>();
    for (const [id, tracks] of cleaned.entries()) {
      availableByArtist.set(id, tracks.length);
    }

    const allocation = this.allocationStrategy.allocate({
      artistIds: genreIds,
      songsPerArtist: input.songsPerGenre,
      availableByArtist,
      maxTracks: MAX_TRACKS,
    });

    const selected = new Map<string, Track[]>();
    for (const [genreId, tracks] of cleaned.entries()) {
      const count = allocation.get(genreId) ?? 0;
      selected.set(genreId, tracks.slice(0, count));
    }

    const seen = new Set<string>();
    const filtered = new Map<string, Track[]>();
    for (const [genreId, tracks] of selected.entries()) {
      const kept: Track[] = [];
      for (const track of tracks) {
        const key = this.duplicateSpec.keyFor(track);
        if (seen.has(key)) continue;
        seen.add(key);
        kept.push(track);
      }
      filtered.set(genreId, kept);
    }

    const ordered = createOrderingStrategy(input.shuffle).order(filtered);

    return {
      tracks: ordered.slice(0, MAX_TRACKS),
      allocation,
    };
  }
}

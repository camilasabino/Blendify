import type { GenreRegion } from '@blendify/contracts';

export interface ResolvedAiSeed {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface ResolvedAiTrackSeed extends ResolvedAiSeed {
  artistId: string;
  artistName: string;
  uri: string;
  durationMs: number;
  popularity: number | null;
}

export interface ResolvedAiSeeds {
  artists: ResolvedAiSeed[];
  genres: ResolvedAiSeed[];
  region?: GenreRegion;
  track: ResolvedAiTrackSeed | null;
}

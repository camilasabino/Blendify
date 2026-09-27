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
  popularity: number;
}

export interface ResolvedAiSeeds {
  artists: ResolvedAiSeed[];
  genres: ResolvedAiSeed[];
  track: ResolvedAiTrackSeed | null;
}

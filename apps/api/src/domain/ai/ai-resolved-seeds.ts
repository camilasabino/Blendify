export interface ResolvedAiSeed {
  id: string;
  name: string;
}

export interface ResolvedAiTrackSeed extends ResolvedAiSeed {
  artistId: string;
  artistName: string;
}

export interface ResolvedAiSeeds {
  artists: ResolvedAiSeed[];
  genres: ResolvedAiSeed[];
  track: ResolvedAiTrackSeed | null;
}

import { MixMode } from './mix-mode';

export interface ArtistTrackQuery {
  queries: string[];
  offsets: number[];
  maxSearches: number;
  rank: 'popularity_desc' | 'popularity_asc' | 'as_found';
}

export function buildArtistQueries(
  artistName: string,
  mode: MixMode,
): ArtistTrackQuery {
  const name = artistName.trim();
  const quoted = `artist:"${name}"`;

  switch (mode) {
    case MixMode.POPULAR:
      return {
        queries: [quoted, `${quoted} hits`],
        offsets: [0],
        maxSearches: 2,
        rank: 'popularity_desc',
      };
    case MixMode.BALANCED:
      return {
        queries: [quoted],
        offsets: [0, 10],
        maxSearches: 2,
        rank: 'as_found',
      };
    case MixMode.RARITIES:
      return {
        queries: [quoted, `${name} deep cuts`],
        offsets: [10, 20],
        maxSearches: 2,
        rank: 'popularity_asc',
      };
    case MixMode.MOOD_ENERGETIC:
      return {
        queries: [`${quoted} energetic`, `${name} upbeat`],
        offsets: [0],
        maxSearches: 2,
        rank: 'as_found',
      };
    case MixMode.MOOD_CHILL:
      return {
        queries: [`${quoted} chill`, `${name} acoustic`],
        offsets: [0],
        maxSearches: 2,
        rank: 'as_found',
      };
    case MixMode.MOOD_MELANCHOLIC:
      return {
        queries: [`${quoted} sad`, `${name} ballad`],
        offsets: [0],
        maxSearches: 2,
        rank: 'as_found',
      };
  }
}

export function rankTracksForMix<T extends { popularity: number }>(
  tracks: T[],
  rank: ArtistTrackQuery['rank'],
): T[] {
  if (rank === 'as_found') return tracks;
  const copy = [...tracks];
  copy.sort((a, b) =>
    rank === 'popularity_desc'
      ? b.popularity - a.popularity
      : a.popularity - b.popularity,
  );
  return copy;
}

import {
  PopularityMode,
  type PopularityMode as PopularityModeValue,
} from '@blendify/contracts';

export interface ArtistTrackQuery {
  queries: string[];
  offsets: number[];
  maxSearches: number;
  rank: 'popularity_desc' | 'popularity_asc' | 'as_found';
}

/** Soft ceiling for "Joyas ocultas" — prefer deep cuts without emptying the pool. */
const RARITIES_MAX_POPULARITY = 55;

/**
 * Search plans for artist track collection.
 * Spotify search is paginated so known artists can fill their track budget when
 * top-tracks is blocked (Dev Mode 403).
 */
export function buildArtistQueries(
  artistName: string,
  popularity: PopularityModeValue,
): ArtistTrackQuery {
  const name = artistName.trim();
  const quoted = `artist:"${name}"`;

  switch (popularity) {
    case PopularityMode.POPULAR:
      return {
        queries: [quoted],
        offsets: [0, 10, 20],
        maxSearches: 3,
        rank: 'popularity_desc',
      };
    case PopularityMode.BALANCED:
      return {
        queries: [quoted],
        offsets: [0, 10, 20],
        maxSearches: 3,
        rank: 'as_found',
      };
    case PopularityMode.RARITIES:
      return {
        queries: [quoted],
        // Fallback only — primary path uses Last.fm artist.getTopTracks.
        offsets: [0, 10, 20],
        maxSearches: 3,
        rank: 'popularity_asc',
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

/**
 * Prefer popular tracks without shrinking below the requested count.
 * If the hard threshold would leave us short, keep a popularity-sorted pool.
 */
export function preferPopularTracks<T extends { popularity: number }>(
  tracks: T[],
  needed: number,
  minPopularity = 35,
): T[] {
  if (tracks.length === 0 || needed <= 0) return tracks;
  const ranked = rankTracksForMix(tracks, 'popularity_desc');
  const popular = ranked.filter((t) => t.popularity >= minPopularity);
  if (popular.length >= needed) return popular;
  return ranked;
}

/**
 * Prefer lower-popularity cuts for "Joyas ocultas".
 * Soft fallback: if the ceiling would underfill, keep the least-popular pool.
 */
export function preferRareTracks<T extends { popularity: number }>(
  tracks: T[],
  needed: number,
  maxPopularity = RARITIES_MAX_POPULARITY,
): T[] {
  if (tracks.length === 0 || needed <= 0) return tracks;
  const ranked = rankTracksForMix(tracks, 'popularity_asc');
  const rare = ranked.filter((t) => t.popularity <= maxPopularity);
  if (rare.length >= needed) return rare;
  return ranked;
}

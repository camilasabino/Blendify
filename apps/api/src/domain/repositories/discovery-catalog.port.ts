export const DISCOVERY_CATALOG = 'DISCOVERY_CATALOG' as const;

export type SimilarArtistCandidate = {
  name: string;
  mbid?: string;
  match?: number;
  url?: string;
  imageUrl?: string;
};

export type SimilarTrackCandidate = {
  name: string;
  artistName: string;
  mbid?: string;
  match?: number;
  playcount?: number;
  url?: string;
  imageUrl?: string;
};

export type CatalogTrackCandidate = {
  artistName: string;
  trackName: string;
  playcount?: number;
  rank?: number;
};

export interface DiscoveryCatalogPort {
  isConfigured(): boolean;
  getSimilarArtists(
    artistName: string,
    limit?: number,
  ): Promise<SimilarArtistCandidate[]>;
  getSimilarTracks(
    artistName: string,
    trackName: string,
    limit?: number,
  ): Promise<SimilarTrackCandidate[]>;
  getTopArtistsForTag(
    tag: string,
    limit?: number,
  ): Promise<SimilarArtistCandidate[]>;
  getTopTracksForTag(
    tag: string,
    limit?: number,
    page?: number,
  ): Promise<CatalogTrackCandidate[]>;
  getTopTracksForArtist(
    artist: string,
    limit?: number,
  ): Promise<CatalogTrackCandidate[]>;
}

import { Artist } from '../artist/artist.entity';
import { Track } from '../track/track.entity';

export const CATALOG_PROVIDER_FACTORY = 'CATALOG_PROVIDER_FACTORY' as const;

export interface SearchTracksOptions {
  limit?: number;
  offset?: number;
}

export interface ResolveTrackOptions {
  /** When set, only accept Spotify tracks that include this artist. */
  artistId?: string;
}

export interface CatalogProviderPort {
  searchArtists(query: string, limit?: number): Promise<Artist[]>;

  searchTracks(query: string, options?: SearchTracksOptions): Promise<Track[]>;

  /**
   * Resolve a specific artist+track title to a Spotify track (precise search).
   * Preferred over paginated artist search for catalog charts from Last.fm.
   */
  resolveTrack(
    artistName: string,
    trackName: string,
    options?: ResolveTrackOptions,
  ): Promise<Track | null>;

  getArtistsByIds(ids: string[]): Promise<Artist[]>;
}

export interface CatalogProviderFactoryPort {
  forMarket(market?: string | null): CatalogProviderPort;
}

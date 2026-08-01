import { Playlist } from '../playlist/playlist.entity';

export const PLAYLIST_REPOSITORY = 'PLAYLIST_REPOSITORY' as const;

type PlaylistLibraryQuery = {
  limit: number;
  offset: number;
  q?: string;
};

type PlaylistLibraryResultPage = {
  items: Playlist[];
  total: number;
};

export type PlaylistLibraryFilter = {
  q?: string;
  playlistIds?: string[];
  missingOnSpotify?: boolean;
};

export interface PlaylistRepositoryPort {
  save(playlist: Playlist): Promise<Playlist>;

  findById(id: string): Promise<Playlist | null>;

  listLibrary(
    userId: string,
    filter: PlaylistLibraryFilter,
  ): Promise<Playlist[]>;

  listLibraryPage(
    userId: string,
    query: PlaylistLibraryQuery,
  ): Promise<PlaylistLibraryResultPage>;

  deleteFailedByUserId(userId: string): Promise<number>;

  countLibraryPresence(
    userId: string,
    q?: string,
  ): Promise<{ total: number; active: number; deleted: number }>;

  delete(id: string): Promise<void>;
}

import { Playlist } from '@/domain/playlist/playlist.entity';

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

  delete(id: string): Promise<void>;

  deleteMany(userId: string, ids: string[]): Promise<void>;
}

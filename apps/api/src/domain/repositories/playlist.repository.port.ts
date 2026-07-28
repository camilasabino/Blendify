import { Playlist } from '../playlist/playlist.entity';

export const PLAYLIST_REPOSITORY = 'PLAYLIST_REPOSITORY' as const;

export type PlaylistHistoryQuery = {
  limit: number;
  offset: number;
  q?: string;
};

export type PlaylistHistoryPage = {
  items: Playlist[];
  total: number;
};

export interface PlaylistRepositoryPort {
  save(playlist: Playlist): Promise<Playlist>;

  findById(id: string): Promise<Playlist | null>;

  findByUserId(userId: string): Promise<Playlist[]>;

  findByUserIdPage(
    userId: string,
    query: PlaylistHistoryQuery,
  ): Promise<PlaylistHistoryPage>;

  deleteFailedByUserId(userId: string): Promise<number>;

  countPresence(
    userId: string,
    q?: string,
  ): Promise<{ total: number; active: number; deleted: number }>;

  delete(id: string): Promise<void>;
}

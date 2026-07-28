import { z } from 'zod';
import {
  MAX_ARTISTS,
  MAX_SONGS_PER_ARTIST,
  MAX_TRACKS,
} from '../../domain/constants';
import { MixMode } from '../../domain/genre/mix-mode';

export const GeneratePlaylistSchema = z.object({
  userId: z.string().min(1),
  name: z.string().max(100).optional().default(''),
  description: z.string().max(300).optional().default(''),
  artistIds: z
    .array(z.string().min(1))
    .min(1, 'At least one artist is required')
    .max(MAX_ARTISTS, `Maximum ${MAX_ARTISTS} artists allowed`),
  artists: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(200),
        imageUrl: z.string().max(500).nullable().optional(),
      }),
    )
    .max(MAX_ARTISTS)
    .optional(),
  songsPerArtist: z.number().int().min(1).max(MAX_SONGS_PER_ARTIST).default(10),
  mixMode: z.nativeEnum(MixMode).default(MixMode.BALANCED),
  shuffle: z.boolean().default(true),
  isPublic: z.boolean().optional().default(false),
  coverImageBase64: z.string().min(1).max(400_000).optional(),
});

export type GeneratePlaylistDto = z.infer<typeof GeneratePlaylistSchema>;

export const RenamePlaylistSchema = z.object({
  playlistId: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1).max(100),
});

export type RenamePlaylistDto = z.infer<typeof RenamePlaylistSchema>;

export const SearchArtistsSchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export type SearchArtistsDto = z.infer<typeof SearchArtistsSchema>;

export const PlaylistIdUserSchema = z.object({
  playlistId: z.string().min(1),
  userId: z.string().min(1),
});

export type PlaylistIdUserDto = z.infer<typeof PlaylistIdUserSchema>;

export function assertRequestedTrackBudget(
  artistCount: number,
  songsPerArtist: number,
): void {
  if (artistCount * songsPerArtist > MAX_TRACKS) {
    throw new Error(
      `Requested track budget exceeds max playlist size (${MAX_TRACKS}).`,
    );
  }
}

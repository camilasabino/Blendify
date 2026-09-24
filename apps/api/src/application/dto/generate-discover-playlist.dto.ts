import {
  DiscoverArtistRequestSchema,
  DiscoverTrackRequestSchema,
} from '@blendify/contracts';
import { z } from 'zod';

const publicationFields = {
  coverImageBase64: true,
  persistToLibrary: true,
} as const;

export const GenerateDiscoverPlaylistSchema = z
  .discriminatedUnion('kind', [
    DiscoverArtistRequestSchema.omit(publicationFields),
    DiscoverTrackRequestSchema.omit(publicationFields),
  ])
  .and(
    z.object({
      market: z.string().optional(),
    }),
  );

export type GenerateDiscoverPlaylistDto = z.input<
  typeof GenerateDiscoverPlaylistSchema
>;
